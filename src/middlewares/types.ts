import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';

/**
 * Redaction summary attached to a request by PII middleware so that audit
 * middleware can log it without re-scanning the response.
 */
export interface RedactionContext {
  redactionCount: number;
  redactedTypes: string[];
}

/**
 * A {@link CallToolRequest} augmented with optional redaction metadata.
 *
 * Injected by `createPiiToolMiddleware` and consumed by `createAuditMiddleware`.
 */
export type AnnotatedCallToolRequest = CallToolRequest & {
  _piiRedaction?: RedactionContext;
};
