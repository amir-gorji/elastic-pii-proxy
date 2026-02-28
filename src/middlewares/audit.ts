/**
 * Audit middleware brick.
 *
 * Wraps tool calls and emits a structured {@link AuditEntry} after the entire
 * inner pipeline has completed (including PII redaction). This means the audit
 * log NEVER contains raw PII — it always reflects post-redaction data.
 *
 * Timing spans the full inner pipeline (piiMW + upstream I/O), giving an
 * accurate end-to-end latency figure.
 *
 * @module
 */
import type { CompatibilityCallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuditLogger } from '../lib/auditLogger.js';
import type { ToolMiddleware } from 'mcpose';
import type { AnnotatedCallToolRequest } from './types.js';

function baseEntry(
  req: AnnotatedCallToolRequest,
  profileName: string,
  start: number,
) {
  return {
    timestamp: new Date().toISOString(),
    upstream_tool: req.params.name,
    compliance_profile: profileName,
    input_parameters: JSON.stringify(req.params.arguments ?? {}),
    execution_time_ms: Date.now() - start,
  };
}

/**
 * Creates an audit middleware that logs each tool invocation after redaction.
 *
 * Should be the **outermost** layer (last in `pipe([piiMW, auditMW])`) so that:
 *  1. Timing starts before the PII layer runs.
 *  2. Logging happens after redaction — never on raw data.
 *
 * @param logger      - Audit logger instance.
 * @param profileName - Name of the active compliance profile (e.g., `"GDPR"`).
 */
export function createAuditMiddleware(
  logger: AuditLogger,
  profileName: string,
): ToolMiddleware {
  return async (req: AnnotatedCallToolRequest, next) => {
    const start = Date.now();
    let result: CompatibilityCallToolResult;

    try {
      result = await next(req);
    } catch (err) {
      // Log the failure and re-throw so the MCP server can return a proper error.
      logger.log({
        ...baseEntry(req, profileName, start),
        output_size_bytes: 0,
        redaction_count: 0,
        redacted_types: [],
        status: 'error',
        error_message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    // Read redaction stats injected by piiToolMiddleware (inner layer).
    const pii = req._piiRedaction ?? { redactionCount: 0, redactedTypes: [] };
    const outputStr = JSON.stringify(result);

    logger.log({
      ...baseEntry(req, profileName, start),
      output_size_bytes: Buffer.byteLength(outputStr, 'utf8'),
      redaction_count: pii.redactionCount,
      redacted_types: pii.redactedTypes,
      status: 'isError' in result && result.isError ? 'error' : 'success',
    });

    return result;
  };
}
