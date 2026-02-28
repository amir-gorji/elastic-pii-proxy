import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chunkText, redactStringWithComprehend } from '../comprehendClient';

// ---------------------------------------------------------------------------
// Mock the AWS SDK so tests run without real AWS credentials
// ---------------------------------------------------------------------------
vi.mock('@aws-sdk/client-comprehend', () => {
  const send = vi.fn();
  const ComprehendClient = vi.fn(() => ({ send }));
  const ContainsPiiEntitiesCommand = vi.fn((input: any) => ({
    __type: 'ContainsPii',
    input,
  }));
  const DetectPiiEntitiesCommand = vi.fn((input: any) => ({
    __type: 'DetectPii',
    input,
  }));
  return {
    ComprehendClient,
    ContainsPiiEntitiesCommand,
    DetectPiiEntitiesCommand,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeMockClient(
  containsLabels: { Name: string }[],
  detectEntities: {
    Type: string;
    BeginOffset: number;
    EndOffset: number;
    Score?: number;
  }[],
) {
  const { ComprehendClient } = await import('@aws-sdk/client-comprehend');
  const instance = new (ComprehendClient as any)();
  instance.send.mockImplementation((cmd: any) => {
    if (cmd.__type === 'ContainsPii') {
      return Promise.resolve({ Labels: containsLabels });
    }
    return Promise.resolve({ Entities: detectEntities });
  });
  return instance;
}

// ---------------------------------------------------------------------------
// chunkText
// ---------------------------------------------------------------------------

describe('chunkText', () => {
  it('returns the original text as a single chunk when under the limit', () => {
    const text = 'Hello, world!';
    expect(chunkText(text)).toEqual([text]);
  });

  it('splits text exceeding 4500 bytes into multiple chunks at newline boundaries', () => {
    // Build a string that is just over 4500 bytes (ASCII, so 1 byte per char).
    // Each line is 100 chars; 46 lines = 4600 bytes including newlines.
    const line = 'a'.repeat(100);
    const text = Array.from({ length: 46 }, () => line).join('\n');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    // Verify no chunk exceeds the limit.
    const encoder = new TextEncoder();
    for (const chunk of chunks) {
      expect(encoder.encode(chunk).length).toBeLessThanOrEqual(4500);
    }
    // Verify that reassembling chunks recovers the original text.
    expect(chunks.join('\n')).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// redactStringWithComprehend
// ---------------------------------------------------------------------------

describe('redactStringWithComprehend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the string unchanged when ContainsPiiEntities reports no PII', async () => {
    const { DetectPiiEntitiesCommand } =
      await import('@aws-sdk/client-comprehend');
    const client = await makeMockClient([], []);

    const result = await redactStringWithComprehend(
      'No sensitive data here.',
      client as any,
    );

    expect(result.redacted).toBe('No sensitive data here.');
    expect(result.count).toBe(0);
    expect(result.types.size).toBe(0);
    // DetectPiiEntities must NOT have been called.
    expect(DetectPiiEntitiesCommand).not.toHaveBeenCalled();
  });

  it('redacts a NAME entity detected by Comprehend', async () => {
    const text = 'Hello, John Smith, welcome!';
    // "John Smith" starts at index 7 and ends at index 17.
    const client = await makeMockClient(
      [{ Name: 'NAME' }],
      [{ Type: 'NAME', BeginOffset: 7, EndOffset: 17 }],
    );

    const result = await redactStringWithComprehend(text, client as any);

    expect(result.redacted).toBe('Hello, [REDACTED:NAME], welcome!');
    expect(result.count).toBe(1);
    expect(result.types.has('NAME')).toBe(true);
  });

  it('redacts multiple entities in correct (reverse-offset) order', async () => {
    // "Jane Doe" at 0-8, "123 Main St" at 18-29.
    const text = 'Jane Doe lives at 123 Main St.';
    const client = await makeMockClient(
      [{ Name: 'NAME' }, { Name: 'ADDRESS' }],
      [
        { Type: 'NAME', BeginOffset: 0, EndOffset: 8 },
        { Type: 'ADDRESS', BeginOffset: 18, EndOffset: 29 },
      ],
    );

    const result = await redactStringWithComprehend(text, client as any);

    expect(result.redacted).toBe(
      '[REDACTED:NAME] lives at [REDACTED:ADDRESS].',
    );
    expect(result.count).toBe(2);
    expect(result.types.has('NAME')).toBe(true);
    expect(result.types.has('ADDRESS')).toBe(true);
  });

  it('calls DetectPiiEntities multiple times for text exceeding 4500 bytes', async () => {
    const { DetectPiiEntitiesCommand } =
      await import('@aws-sdk/client-comprehend');
    // 46 lines of 100 chars → more than one chunk.
    const line = 'a'.repeat(100);
    const text = Array.from({ length: 46 }, () => line).join('\n');

    const client = await makeMockClient([{ Name: 'GENERIC' }], []);

    await redactStringWithComprehend(text, client as any);

    // Should be called once per chunk (at least 2).
    expect((DetectPiiEntitiesCommand as any).mock.calls.length).toBeGreaterThan(
      1,
    );
  });

  it('ignores entity types not in the redact list', async () => {
    // CREDIT_DEBIT_NUMBER is handled by Stage 1 regex, not Stage 2.
    const text = 'Card: 4111111111111111';
    const client = await makeMockClient(
      [{ Name: 'CREDIT_DEBIT_NUMBER' }],
      [{ Type: 'CREDIT_DEBIT_NUMBER', BeginOffset: 6, EndOffset: 22 }],
    );

    const result = await redactStringWithComprehend(text, client as any);

    expect(result.redacted).toBe(text);
    expect(result.count).toBe(0);
  });
});
