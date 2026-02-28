/**
 * PII redaction middleware bricks.
 *
 * Two factories — one for tool calls, one for resource reads — each returning a
 * {@link Middleware} that redacts PII from the upstream response before it
 * reaches the LLM or the audit layer.
 *
 * Both factories reuse the existing {@link redactPII} / {@link redactPIIDeep}
 * functions from `src/lib/piiRedaction.ts`; they only add the middleware
 * plumbing (call next, then scrub).
 *
 * **Why are tool and resource middlewares separate?**
 * The MCP protocol uses different response shapes for each request type:
 * - `tools/call`      → `CallToolResult.content: ContentBlock[]`
 *                       (has an `isError` flag; error responses pass through unchanged)
 * - `resources/read`  → `ReadResourceResult.contents: ResourceContent[]`
 *                       (all items are text or blob; no error flag)
 * A single generic middleware could not safely access `.content` vs `.contents`
 * or apply the `isError` short-circuit without knowing the response shape upfront.
 *
 * @module
 */
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import {
  hasToolContent,
  type ResourceMiddleware,
  type ToolMiddleware,
} from 'mcpose';
import type { AnnotatedCallToolRequest } from './types.js';
import type { ProxyConfig } from '../lib/config.js';
import {
  redactPII,
  redactPIIDeep,
  type RedactionResult,
} from '../lib/piiRedaction.js';
import type { ComplianceProfile } from './complianceProfiles.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Applies the configured redaction stages to a string value.
 * Returns the redacted string and accumulated counts/types.
 */
async function redactText(
  text: string,
  profile: ComplianceProfile,
  config: ProxyConfig,
): Promise<RedactionResult> {
  if (!profile.stage1) {
    return { redactedData: text, redactionCount: 0, redactedTypes: [] };
  }

  if (profile.stage2 && config.comprehendEnabled) {
    return redactPIIDeep(text, config);
  }

  return redactPII(text);
}

/**
 * Merges two {@link RedactionResult}s (for accumulating counts across blocks).
 */
const mergeResults = (
  acc: { redactionCount: number; redactedTypes: string[] },
  r: RedactionResult,
): { redactionCount: number; redactedTypes: string[] } => ({
  redactionCount: acc.redactionCount + r.redactionCount,
  redactedTypes: [...new Set([...acc.redactedTypes, ...r.redactedTypes])],
});

// ---------------------------------------------------------------------------
// Tool call middleware
// ---------------------------------------------------------------------------

/**
 * Redacts PII from every `text` content block in a `CallToolResult`.
 *
 * - Errors (`result.isError === true`) are returned unchanged — they are
 *   typically short error messages, not data blobs.
 * - Non-text content blocks (image, audio, embedded resources) pass through
 *   unchanged.
 * - Redaction summary is attached to the request as `_piiRedaction` so the
 *   audit middleware can log it without re-scanning.
 *
 * @param config  - Proxy config (controls stage 2 / Comprehend).
 * @param profile - Active compliance profile.
 */
export function createPiiToolMiddleware(
  config: ProxyConfig,
  profile: ComplianceProfile,
): ToolMiddleware {
  return async (req: AnnotatedCallToolRequest, next) => {
    const result = await next(req);

    // Legacy protocol shape (toolResult format) — no content array to redact; pass through.
    if (!hasToolContent(result)) return result;

    // Error responses are already non-PII (tool error messages); pass through.
    if (result.isError) return result;

    let accumulated = { redactionCount: 0, redactedTypes: [] as string[] };
    const redactedContent: ContentBlock[] = [];

    for (const block of result.content ?? []) {
      if (block.type !== 'text') {
        redactedContent.push(block);
        continue;
      }

      const r = await redactText(block.text, profile, config);
      accumulated = mergeResults(accumulated, r);
      redactedContent.push({ ...block, text: r.redactedData as string });
    }

    // Attach redaction metadata to request so audit middleware can read it.
    req._piiRedaction = accumulated;

    return { ...result, content: redactedContent };
  };
}

// ---------------------------------------------------------------------------
// Resource read middleware
// ---------------------------------------------------------------------------

/**
 * Redacts PII from every text resource content item in a `ReadResourceResult`.
 *
 * Blob contents pass through unchanged.
 */
export function createPiiResourceMiddleware(
  config: ProxyConfig,
  profile: ComplianceProfile,
): ResourceMiddleware {
  return async (req, next) => {
    const result = await next(req);

    const redactedContents = await Promise.all(
      result.contents.map(async (item) => {
        if (!('text' in item)) return item; // blob — skip
        const r = await redactText(item.text, profile, config);
        return { ...item, text: r.redactedData as string };
      }),
    );

    return { ...result, contents: redactedContents };
  };
}
