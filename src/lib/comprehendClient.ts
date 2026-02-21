/**
 * AWS Comprehend wrapper for NER-based PII redaction (Stage 2).
 *
 * Chunks input text to stay within Comprehend's 5,000-byte limit, uses a
 * cheap pre-filter (`ContainsPiiEntities`) to skip clean strings, and
 * replaces detected entity spans in reverse offset order so earlier spans
 * aren't invalidated by replacements.
 *
 * AWS credentials are resolved automatically via the standard credential chain
 * (env vars, ~/.aws/credentials, IAM role, etc.).
 *
 * @module
 */
import {
  ComprehendClient,
  ContainsPiiEntitiesCommand,
  DetectPiiEntitiesCommand,
  type PiiEntity,
} from '@aws-sdk/client-comprehend';

/** Maximum bytes per chunk — safely below Comprehend's 5,000-byte hard limit. */
const CHUNK_BYTE_LIMIT = 4500;

/**
 * Entity types handled by Stage 2.
 * Stage 1 (regex) already covers EMAIL, PHONE, CREDIT_DEBIT_NUMBER.
 */
const REDACT_TYPES = new Set([
  'NAME',
  'ADDRESS',
  'DATE_TIME',
  'AGE',
  'USERNAME',
  'PASSWORD',
  'IP_ADDRESS',
  'BANK_ACCOUNT_NUMBER',
  'PASSPORT_NUMBER',
  'DRIVER_ID',
  'AWS_ACCESS_KEY',
  'MAC_ADDRESS',
]);

/**
 * Splits a string into chunks of at most {@link CHUNK_BYTE_LIMIT} bytes,
 * preferring newline boundaries to avoid splitting mid-word.
 */
export function chunkText(text: string): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= CHUNK_BYTE_LIMIT) {
    return [text];
  }

  const chunks: string[] = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    const candidate = current ? current + '\n' + line : line;
    if (encoder.encode(candidate).length > CHUNK_BYTE_LIMIT) {
      if (current) {
        chunks.push(current);
        current = line;
      } else {
        // Single line exceeds limit — split by characters
        let remaining = line;
        while (encoder.encode(remaining).length > CHUNK_BYTE_LIMIT) {
          // Binary search for the split point
          let lo = 0;
          let hi = remaining.length;
          while (lo < hi - 1) {
            const mid = Math.floor((lo + hi) / 2);
            if (encoder.encode(remaining.slice(0, mid)).length <= CHUNK_BYTE_LIMIT) {
              lo = mid;
            } else {
              hi = mid;
            }
          }
          chunks.push(remaining.slice(0, lo));
          remaining = remaining.slice(lo);
        }
        current = remaining;
      }
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

/**
 * Applies span-based redaction to a single text chunk using Comprehend entity results.
 * Processes spans in reverse offset order to preserve validity of earlier offsets.
 */
function applyRedactions(text: string, entities: PiiEntity[]): { redacted: string; count: number; types: Set<string> } {
  const types = new Set<string>();

  const relevant = entities
    .filter(
      (e) =>
        e.Type &&
        REDACT_TYPES.has(e.Type) &&
        e.BeginOffset !== undefined &&
        e.EndOffset !== undefined,
    )
    .sort((a, b) => (b.BeginOffset ?? 0) - (a.BeginOffset ?? 0));

  let redacted = text;
  for (const entity of relevant) {
    const begin = entity.BeginOffset!;
    const end = entity.EndOffset!;
    const type = entity.Type!;
    redacted = redacted.slice(0, begin) + `[REDACTED:${type}]` + redacted.slice(end);
    types.add(type);
  }

  return { redacted, count: relevant.length, types };
}

/**
 * Redacts PII from a single string using AWS Comprehend.
 *
 * Uses `ContainsPiiEntities` as a cheap pre-filter: if no PII is detected,
 * `DetectPiiEntities` is never called. For large strings the text is split
 * into chunks that individually respect Comprehend's byte limit.
 *
 * @returns The redacted string along with a count and set of redacted types.
 */
export async function redactStringWithComprehend(
  text: string,
  client: ComprehendClient,
): Promise<{ redacted: string; count: number; types: Set<string> }> {
  const empty = { redacted: text, count: 0, types: new Set<string>() };

  // Pre-filter: skip the more expensive DetectPiiEntities call if Comprehend
  // says the text contains no PII at all.
  const preFilter = await client.send(
    new ContainsPiiEntitiesCommand({ Text: text.slice(0, 4500), LanguageCode: 'en' }),
  );
  if (!preFilter.Labels || preFilter.Labels.length === 0) {
    return empty;
  }

  const chunks = chunkText(text);
  const allTypes = new Set<string>();
  let totalCount = 0;
  const redactedChunks: string[] = [];

  for (const chunk of chunks) {
    const detection = await client.send(
      new DetectPiiEntitiesCommand({ Text: chunk, LanguageCode: 'en' }),
    );
    const entities = detection.Entities ?? [];
    const { redacted, count, types } = applyRedactions(chunk, entities);
    redactedChunks.push(redacted);
    totalCount += count;
    for (const t of types) allTypes.add(t);
  }

  return { redacted: redactedChunks.join('\n'), count: totalCount, types: allTypes };
}

/** Creates a configured AWS Comprehend client for the given region. */
export function createComprehendClient(region: string): ComprehendClient {
  return new ComprehendClient({ region });
}
