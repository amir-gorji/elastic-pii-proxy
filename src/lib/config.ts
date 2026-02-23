/**
 * Server configuration loaded from environment variables.
 *
 * Required variables: `ELASTIC_URL`, `ELASTIC_API_KEY`.
 * All other settings have sensible defaults for development.
 *
 * @see {@link loadConfig} for the loader that populates this interface.
 */
export interface ServerConfig {
  /** Base URL of the Elasticsearch deployment (e.g., `https://xyz.es.us-east-1.aws.found.io` or `http://localhost:9200`). */
  elasticsearchUrl: string;
  /** Base URL of the Kibana deployment (optional — required only for Kibana-specific features like alert status). */
  kibanaUrl?: string;
  /** Base64-encoded API key for authenticating with Elasticsearch (and Kibana when KIBANA_URL is set). */
  elasticApiKey: string;
  /** Glob patterns restricting which indices the agent may access. Empty = unrestricted. */
  allowedIndexPatterns: string[];
  /** Hard cap on documents returned per search (1--500). Protects token budgets. */
  maxSearchSize: number;
  /** HTTP request timeout in milliseconds. */
  requestTimeoutMs: number;
  /** Number of retry attempts for transient failures (429, 503, network errors). */
  retryAttempts: number;
  /** Base delay in ms for exponential backoff between retries. */
  retryDelayMs: number;
  /** Kibana space slug (empty string = default space). */
  kibanaSpace: string;
  /** Whether to emit structured audit log entries to stderr. */
  auditEnabled: boolean;
  /** Whether to scan and mask PII (credit cards, IBANs, SSNs, etc.) in tool responses. */
  piiRedactionEnabled: boolean;
  /** AWS region for Comprehend calls (e.g. 'us-east-1'). */
  awsRegion: string;
  /** Whether to run Stage 2 NER-based PII redaction via AWS Comprehend. */
  comprehendEnabled: boolean;
}

/** @throws {Error} If the environment variable is not set. */
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Loads server configuration from environment variables.
 *
 * `ELASTIC_URL` must point directly to your Elasticsearch instance.
 * `KIBANA_URL` is optional — set it only if you need Kibana-specific features
 * such as alert status retrieval.
 *
 * @throws {Error} If required variables (`ELASTIC_URL`, `ELASTIC_API_KEY`) are missing.
 */
export function loadConfig(): ServerConfig {
  const maxSearchSizeRaw = parseInt(process.env.MAX_SEARCH_SIZE || '100', 10);
  const maxSearchSize = Math.min(Math.max(1, maxSearchSizeRaw), 500);

  return {
    elasticsearchUrl: requiredEnv('ELASTIC_URL'),
    kibanaUrl: process.env.KIBANA_URL || undefined,
    elasticApiKey: requiredEnv('ELASTIC_API_KEY'),
    allowedIndexPatterns: process.env.ALLOWED_INDEX_PATTERNS
      ? process.env.ALLOWED_INDEX_PATTERNS.split(',').map((p) => p.trim()).filter(Boolean)
      : [],
    maxSearchSize,
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10),
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
    kibanaSpace: process.env.KIBANA_SPACE || '',
    auditEnabled: process.env.AUDIT_ENABLED !== 'false',
    piiRedactionEnabled: process.env.PII_REDACTION_ENABLED !== 'false',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    comprehendEnabled: process.env.COMPREHEND_ENABLED === 'true',
  };
}
