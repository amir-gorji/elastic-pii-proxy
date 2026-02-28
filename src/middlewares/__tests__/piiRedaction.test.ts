import { describe, it, expect } from 'vitest';
import { createPiiToolMiddleware, createPiiResourceMiddleware } from '../piiRedaction.js';
import { runToolMiddleware } from 'mcpose/testing';
import type { ComplianceProfile } from '../complianceProfiles.js';
import type { ReadResourceRequest } from '@modelcontextprotocol/sdk/types.js';
import { makeConfig, makeToolReq, makeToolResult, makeErrorToolResult } from '../../__tests__/fixtures.js';

const baseConfig = makeConfig({ auditEnabled: false });

const gdprProfile: ComplianceProfile = {
  name: 'GDPR',
  stage1: true,
  stage2: false,
};

const noRedactProfile: ComplianceProfile = {
  name: 'NONE',
  stage1: false,
  stage2: false,
};

describe('createPiiToolMiddleware', () => {
  it('redacts email address in text content block', async () => {
    const mw = createPiiToolMiddleware(baseConfig, gdprProfile);
    const req = makeToolReq();
    const result = await runToolMiddleware(mw, req, async () =>
      makeToolResult('Contact us at john@example.com for details'),
    );

    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect((result.content[0] as any).text).not.toContain('john@example.com');
    expect((result.content[0] as any).text).toContain('@example.com');
  });

  it('redacts SSN in text content block', async () => {
    const mw = createPiiToolMiddleware(baseConfig, gdprProfile);
    const req = makeToolReq();
    const result = await runToolMiddleware(mw, req, async () =>
      makeToolResult('SSN: 123-45-6789'),
    );
    expect((result.content[0] as any).text).not.toContain('123-45-6789');
    expect((result.content[0] as any).text).toContain('***-**-****');
  });

  it('passes non-text content blocks through unchanged', async () => {
    const mw = createPiiToolMiddleware(baseConfig, gdprProfile);
    const req = makeToolReq();
    const imageBlock = { type: 'image' as const, data: 'base64data', mimeType: 'image/png' };
    const result = await runToolMiddleware(mw, req, async () => ({
      content: [imageBlock],
    }));
    expect(result.content[0]).toEqual(imageBlock);
  });

  it('returns error results unchanged', async () => {
    const mw = createPiiToolMiddleware(baseConfig, gdprProfile);
    const req = makeToolReq();
    const errorResult = makeErrorToolResult('user@example.com caused an error');
    const result = await runToolMiddleware(mw, req, async () => errorResult);

    // Email should NOT be redacted — error paths are returned as-is
    expect((result.content[0] as any).text).toContain('user@example.com');
    expect(result.isError).toBe(true);
  });

  it('attaches _piiRedaction metadata to the request', async () => {
    const mw = createPiiToolMiddleware(baseConfig, gdprProfile);
    const req = makeToolReq() as any;
    await mw(req, async () => makeToolResult('SSN: 123-45-6789'));

    expect(req._piiRedaction).toBeDefined();
    expect(req._piiRedaction.redactionCount).toBeGreaterThan(0);
    expect(req._piiRedaction.redactedTypes).toContain('ssn');
  });

  it('skips all redaction when stage1 is false', async () => {
    const mw = createPiiToolMiddleware(baseConfig, noRedactProfile);
    const req = makeToolReq();
    const result = await runToolMiddleware(mw, req, async () =>
      makeToolResult('Email: john@example.com'),
    );
    expect((result.content[0] as any).text).toContain('john@example.com');
  });

  it('handles empty content array', async () => {
    const mw = createPiiToolMiddleware(baseConfig, gdprProfile);
    const req = makeToolReq();
    const result = await runToolMiddleware(mw, req, async () => ({ content: [] }));
    expect(result.content).toEqual([]);
  });
});

describe('createPiiResourceMiddleware', () => {
  it('redacts PII from text resource contents', async () => {
    const mw = createPiiResourceMiddleware(baseConfig, gdprProfile);
    const req: ReadResourceRequest = {
      method: 'resources/read',
      params: { uri: 'file://test.txt' },
    };
    const result = await mw(req, async () => ({
      contents: [
        { uri: 'file://test.txt', text: 'SSN: 123-45-6789', mimeType: 'text/plain' },
      ],
    }));

    expect((result.contents[0] as any).text).not.toContain('123-45-6789');
  });

  it('passes blob resource contents through unchanged', async () => {
    const mw = createPiiResourceMiddleware(baseConfig, gdprProfile);
    const req: ReadResourceRequest = {
      method: 'resources/read',
      params: { uri: 'file://img.png' },
    };
    const result = await mw(req, async () => ({
      contents: [{ uri: 'file://img.png', blob: 'base64data', mimeType: 'image/png' }],
    }));

    expect((result.contents[0] as any).blob).toBe('base64data');
  });
});
