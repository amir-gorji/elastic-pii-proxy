/**
 * Proxy configuration loaded from environment variables.
 *
 * The proxy sits between an LLM agent and an upstream MCP server (e.g., Elastic v8.18+),
 * scrubbing PII and emitting an audit trail before clean data reaches the model.
 *
 * @see {@link loadConfig} for the loader that populates this interface.
 */
export interface ProxyConfig {
  /** Shell command used to spawn the upstream MCP server (e.g., `"node"`). */
  command: string;
  /** Arguments passed to the upstream command (e.g., `["/path/to/elastic-mcp/index.mjs"]`). */
  args: string[];
  /**
   * Alternative: HTTP/SSE URL for the upstream MCP server.
   * When set, stdio spawn is skipped and an HTTP client is used instead.
   */
  url: string | undefined;
  /** Compliance profile to apply: GDPR | DORA | PCI_DSS | full */
  complianceProfile: string;
  /** Whether to emit structured audit log entries to stderr. */
  auditEnabled: boolean;
  /** AWS region for Comprehend calls (e.g. `'us-east-1'`). */
  awsRegion: string;
  /** Whether to run Stage 2 NER-based PII redaction via AWS Comprehend. */
  comprehendEnabled: boolean;
}

/** @throws {Error} If the environment variable is not set. */
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseArgs(raw: string): string[] {
  return raw.split(/\s+/).filter(Boolean);
}

/**
 * Loads proxy configuration from environment variables.
 *
 * Either `UPSTREAM_MCP_COMMAND` (stdio) or `UPSTREAM_MCP_URL` (HTTP/SSE) must be set.
 *
 * @throws {Error} If neither upstream source is configured.
 */
export function loadConfig(): ProxyConfig {
  const command = process.env.UPSTREAM_MCP_COMMAND;
  const url = process.env.UPSTREAM_MCP_URL || undefined;

  if (!command && !url) {
    throw new Error(
      'Either UPSTREAM_MCP_COMMAND or UPSTREAM_MCP_URL must be set',
    );
  }

  return {
    command: command ?? '',
    args: command
      ? parseArgs(process.env.UPSTREAM_MCP_ARGS ?? '')
      : [],
    url: url,
    complianceProfile: process.env.COMPLIANCE_PROFILE ?? 'GDPR',
    auditEnabled: process.env.AUDIT_ENABLED !== 'false',
    awsRegion: process.env.AWS_REGION ?? 'us-east-1',
    comprehendEnabled: process.env.COMPREHEND_ENABLED === 'true',
  };
}
