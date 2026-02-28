import { describe, it, expect, vi } from 'vitest';
import { createAuditMiddleware } from '../audit.js';
import { AuditLogger } from '../../lib/auditLogger.js';
import type { AnnotatedCallToolRequest } from '../types.js';
import { makeConfig, makeToolReq, makeToolResult } from '../../__tests__/fixtures.js';

const config = makeConfig();

function makeResult(isError = false) {
  return makeToolResult(isError ? 'error text' : 'clean response');
}

/** Creates a logger that captures output to a vi.fn() instead of stderr. */
function makeLogger(cfg = config): { logger: AuditLogger; writer: ReturnType<typeof vi.fn> } {
  const writer = vi.fn();
  const logger = new AuditLogger(cfg, writer);
  return { logger, writer };
}

describe('createAuditMiddleware', () => {
  it('logs a structured entry after successful tool call', async () => {
    const { logger, writer } = makeLogger();
    const mw = createAuditMiddleware(logger, 'GDPR');

    await mw(makeToolReq('elastic_search'), async () => makeToolResult('clean response'));

    expect(writer).toHaveBeenCalledOnce();
    const entry = JSON.parse(writer.mock.calls[0]![0].trim());
    expect(entry.upstream_tool).toBe('elastic_search');
    expect(entry.compliance_profile).toBe('GDPR');
    expect(entry.status).toBe('success');
    expect(typeof entry.execution_time_ms).toBe('number');
    expect(typeof entry.output_size_bytes).toBe('number');
  });

  it('logs status=error when result.isError is true', async () => {
    const { logger, writer } = makeLogger();
    const mw = createAuditMiddleware(logger, 'GDPR');

    await mw(makeToolReq(), async () => ({ content: [{ type: 'text', text: 'err' }], isError: true }));

    const entry = JSON.parse(writer.mock.calls[0]![0].trim());
    expect(entry.status).toBe('error');
  });

  it('logs status=error and re-throws when next() throws', async () => {
    const { logger, writer } = makeLogger();
    const mw = createAuditMiddleware(logger, 'GDPR');

    await expect(
      mw(makeToolReq(), async () => { throw new Error('upstream down'); }),
    ).rejects.toThrow('upstream down');

    const entry = JSON.parse(writer.mock.calls[0]![0].trim());
    expect(entry.status).toBe('error');
    expect(entry.error_message).toBe('upstream down');
  });

  it('reads redaction metadata injected by piiToolMiddleware', async () => {
    const { logger, writer } = makeLogger();
    const mw = createAuditMiddleware(logger, 'GDPR');

    const req = makeToolReq() as AnnotatedCallToolRequest;
    req._piiRedaction = { redactionCount: 3, redactedTypes: ['email', 'ssn'] };

    await mw(req, async () => makeToolResult());

    const entry = JSON.parse(writer.mock.calls[0]![0].trim());
    expect(entry.redaction_count).toBe(3);
    expect(entry.redacted_types).toEqual(['email', 'ssn']);
  });

  it('records zero redaction when _piiRedaction is absent', async () => {
    const { logger, writer } = makeLogger();
    const mw = createAuditMiddleware(logger, 'GDPR');

    await mw(makeToolReq(), async () => makeToolResult());

    const entry = JSON.parse(writer.mock.calls[0]![0].trim());
    expect(entry.redaction_count).toBe(0);
    expect(entry.redacted_types).toEqual([]);
  });

  it('does NOT log when audit is disabled', async () => {
    const { logger, writer } = makeLogger(makeConfig({ auditEnabled: false }));
    const mw = createAuditMiddleware(logger, 'GDPR');

    await mw(makeToolReq(), async () => makeToolResult());

    expect(writer).not.toHaveBeenCalled();
  });

  it('audit log appears AFTER the inner pipeline (verifying ordering)', async () => {
    const events: string[] = [];
    const { logger } = makeLogger();
    vi.spyOn(logger, 'log').mockImplementation(() => events.push('audit-log'));

    const mw = createAuditMiddleware(logger, 'GDPR');

    await mw(makeToolReq(), async () => {
      events.push('upstream-called');
      return makeToolResult();
    });

    expect(events).toEqual(['upstream-called', 'audit-log']);
  });
});
