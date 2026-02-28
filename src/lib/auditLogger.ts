/**
 * Structured audit logging for MCP tool invocations.
 *
 * Every tool call produces an {@link AuditEntry} written as JSON to stderr.
 * This provides a tamper-evident record for compliance (PCI DSS, GDPR) and
 * operational monitoring. Input parameters are truncated to prevent sensitive
 * data from leaking into audit logs.
 *
 * @module
 */
import { ProxyConfig } from './config';

/**
 * A single audit log record capturing one tool invocation.
 *
 * Written as a JSON line to stderr by {@link AuditLogger.log}.
 * Always reflects post-redaction data — raw PII never appears here.
 */
export interface AuditEntry {
  /** ISO 8601 timestamp of the invocation. */
  timestamp: string;
  /** Name of the upstream MCP tool that was called (e.g., `elastic_search`). */
  upstream_tool: string;
  /** Compliance profile that was active (e.g., `GDPR`). */
  compliance_profile: string;
  /** Serialized input parameters (truncated to 500 chars for safety). */
  input_parameters: string;
  /** Byte size of the serialized response returned to the LLM. */
  output_size_bytes: number;
  /** Number of PII values that were masked in this response. */
  redaction_count: number;
  /** Categories of PII detected (e.g., `['credit_card', 'email']`). */
  redacted_types: string[];
  /** Wall-clock execution time in milliseconds. */
  execution_time_ms: number;
  /** Whether the tool executed successfully or returned an error. */
  status: 'success' | 'error';
  /** Error message (only present when `status` is `'error'`). */
  error_message?: string;
}

const MAX_INPUT_LOG_LENGTH = 500;

/**
 * Writes structured audit records to stderr as JSON lines.
 *
 * Audit logging can be disabled via the `AUDIT_ENABLED` environment variable.
 * When disabled, {@link AuditLogger.log} is a no-op.
 *
 * The optional `writer` parameter allows tests to capture output without
 * spying on `process.stderr`:
 * ```ts
 * const writer = vi.fn();
 * const logger = new AuditLogger(config, writer);
 * logger.log(entry);
 * const parsed = JSON.parse(writer.mock.calls[0][0]);
 * ```
 */
export class AuditLogger {
  private enabled: boolean;
  private writer: (s: string) => void;

  constructor(
    config: ProxyConfig,
    writer: (s: string) => void = (s) => process.stderr.write(s),
  ) {
    this.enabled = config.auditEnabled;
    this.writer = writer;
  }

  log(entry: AuditEntry): void {
    if (!this.enabled) return;

    const sanitized = {
      ...entry,
      input_parameters:
        entry.input_parameters.length > MAX_INPUT_LOG_LENGTH
          ? entry.input_parameters.slice(0, MAX_INPUT_LOG_LENGTH) +
            '...[truncated]'
          : entry.input_parameters,
    };

    this.writer(JSON.stringify(sanitized) + '\n');
  }
}
