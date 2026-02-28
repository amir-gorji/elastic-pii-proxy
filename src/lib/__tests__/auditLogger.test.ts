import { describe, it, expect, vi } from 'vitest';
import { AuditLogger, type AuditEntry } from '../auditLogger.js';
import { makeConfig } from '../../__tests__/fixtures.js';

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: '2024-01-01T00:00:00.000Z',
    upstream_tool: 'elastic_search',
    compliance_profile: 'GDPR',
    input_parameters: '{"q":"test"}',
    output_size_bytes: 100,
    redaction_count: 0,
    redacted_types: [],
    execution_time_ms: 50,
    status: 'success',
    ...overrides,
  };
}

describe('AuditLogger', () => {
  it('writes JSON to the writer when enabled', () => {
    const writer = vi.fn();
    const logger = new AuditLogger(makeConfig(), writer);
    const entry = makeEntry();
    logger.log(entry);

    expect(writer).toHaveBeenCalledOnce();
    const parsed = JSON.parse(writer.mock.calls[0]![0].trim());
    expect(parsed.upstream_tool).toBe('elastic_search');
    expect(parsed.compliance_profile).toBe('GDPR');
    expect(parsed.status).toBe('success');
  });

  it('does not write when disabled', () => {
    const writer = vi.fn();
    const logger = new AuditLogger(makeConfig({ auditEnabled: false }), writer);
    logger.log(makeEntry());
    expect(writer).not.toHaveBeenCalled();
  });

  it('truncates large input parameters', () => {
    const writer = vi.fn();
    const logger = new AuditLogger(makeConfig(), writer);
    const longInput = 'x'.repeat(600);
    logger.log(makeEntry({ input_parameters: longInput }));

    const parsed = JSON.parse(writer.mock.calls[0]![0].trim());
    expect(parsed.input_parameters.length).toBeLessThan(600);
    expect(parsed.input_parameters).toContain('...[truncated]');
  });
});
