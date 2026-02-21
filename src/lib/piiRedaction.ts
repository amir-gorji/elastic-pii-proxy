/**
 * PII detection and redaction engine.
 *
 * Scans tool responses for personally identifiable information (PII) and
 * payment card data (PCI) before they leave the MCP server. This is a
 * defense-in-depth measure — ideally data is masked at ingest, but this
 * layer catches anything that slipped through.
 *
 * Stage 1 (synchronous): regex patterns for credit cards (Luhn-validated),
 * IBANs, US SSNs, email addresses, and international phone numbers.
 *
 * Stage 2 (async, opt-in): AWS Comprehend NER for contextual PII such as
 * full names, addresses, passport numbers, and driver IDs.
 *
 * @module
 */
import { createComprehendClient, redactStringWithComprehend } from './comprehendClient';

/** Result of scanning and redacting a tool response. */
export interface RedactionResult {
  /** The response with PII values replaced by masks. */
  redactedData: any;
  /** Total number of individual PII values that were masked. */
  redactionCount: number;
  /** Distinct categories of PII found (e.g., `['credit_card', 'iban']`). */
  redactedTypes: string[];
}

interface RedactionPattern {
  name: string;
  regex: RegExp;
  mask: (match: string) => string;
}

/**
 * Validates a number string using the Luhn algorithm.
 * Used to distinguish real credit card numbers from random 16-digit sequences.
 */
function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

const PATTERNS: RedactionPattern[] = [
  {
    name: 'credit_card',
    regex: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g,
    mask: (match: string) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length !== 16 || !luhnCheck(digits)) return match;
      const last4 = digits.slice(-4);
      const sep = match.includes('-') ? '-' : match.includes(' ') ? ' ' : '';
      return `****${sep}****${sep}****${sep}${last4}`;
    },
  },
  {
    name: 'iban',
    regex: /\b([A-Z]{2}\d{2}[A-Z0-9]{4,30})\b/g,
    mask: (match: string) => {
      if (match.length < 15) return match;
      return match.slice(0, 4) + '****' + match.slice(-4);
    },
  },
  {
    name: 'ssn',
    regex: /\b(\d{3}-\d{2}-\d{4})\b/g,
    mask: () => '***-**-****',
  },
  {
    name: 'email',
    regex: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    mask: (match: string) => {
      const [local, domain] = match.split('@');
      return `${local[0]}***@${domain}`;
    },
  },
  {
    name: 'phone',
    regex: /(\+\d{1,3}[\s.-]?\d[\s.-]?\d{3,4}[\s.-]?\d{3,4})\b/g,
    mask: (match: string) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 8) return match;
      return `+${digits.slice(0, 2)}***${digits.slice(-2)}`;
    },
  },
];

function redactString(
  value: string,
  typesFound: Set<string>,
): { result: string; count: number } {
  let count = 0;
  let result = value;

  for (const pattern of PATTERNS) {
    result = result.replace(pattern.regex, (match) => {
      const masked = pattern.mask(match);
      if (masked !== match) {
        count++;
        typesFound.add(pattern.name);
      }
      return masked;
    });
  }

  return { result, count };
}

function redactRecursive(
  data: any,
  typesFound: Set<string>,
): { result: any; count: number } {
  if (typeof data === 'string') {
    return redactString(data, typesFound);
  }

  if (Array.isArray(data)) {
    let totalCount = 0;
    const result = data.map((item) => {
      const { result: r, count } = redactRecursive(item, typesFound);
      totalCount += count;
      return r;
    });
    return { result, count: totalCount };
  }

  if (data !== null && typeof data === 'object') {
    let totalCount = 0;
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const { result: r, count } = redactRecursive(value, typesFound);
      result[key] = r;
      totalCount += count;
    }
    return { result, count: totalCount };
  }

  return { result: data, count: 0 };
}

/**
 * Recursively scans a data structure and masks any detected PII.
 *
 * Traverses strings, arrays, and objects. Non-string primitives pass through
 * unchanged. Each detected PII value is replaced with a type-specific mask
 * (e.g., credit card last-4, email first-char + domain).
 *
 * @param data - Any JSON-serializable value (typically a {@link ToolResult}).
 * @returns The redacted data along with counts and categories of what was found.
 */
export function redactPII(data: any): RedactionResult {
  const typesFound = new Set<string>();
  const { result, count } = redactRecursive(data, typesFound);
  return {
    redactedData: result,
    redactionCount: count,
    redactedTypes: Array.from(typesFound),
  };
}

/**
 * Recursively walks a data structure and calls `redactStringWithComprehend`
 * on every string value, accumulating counts and types.
 */
async function redactRecursiveDeep(
  data: any,
  client: import('@aws-sdk/client-comprehend').ComprehendClient,
  typesFound: Set<string>,
): Promise<{ result: any; count: number }> {
  if (typeof data === 'string') {
    const { redacted, count, types } = await redactStringWithComprehend(data, client);
    for (const t of types) typesFound.add(t);
    return { result: redacted, count };
  }

  if (Array.isArray(data)) {
    let totalCount = 0;
    const result: any[] = [];
    for (const item of data) {
      const { result: r, count } = await redactRecursiveDeep(item, client, typesFound);
      result.push(r);
      totalCount += count;
    }
    return { result, count: totalCount };
  }

  if (data !== null && typeof data === 'object') {
    let totalCount = 0;
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const { result: r, count } = await redactRecursiveDeep(value, client, typesFound);
      result[key] = r;
      totalCount += count;
    }
    return { result, count: totalCount };
  }

  return { result: data, count: 0 };
}

/**
 * Two-stage PII redaction:
 * - Stage 1: synchronous regex pass (credit cards, IBANs, SSNs, emails, phones).
 * - Stage 2: async AWS Comprehend NER pass (names, addresses, passport numbers, etc.).
 *
 * Stage 2 is skipped when `config.comprehendEnabled` is `false`, making the
 * function safe to call without AWS credentials.
 *
 * @param data   - Any JSON-serializable value (typically a {@link ToolResult}).
 * @param config - Feature flags; must include `comprehendEnabled` and `awsRegion`.
 * @returns Combined {@link RedactionResult} from both stages.
 */
export async function redactPIIDeep(
  data: any,
  config: { comprehendEnabled: boolean; awsRegion: string },
): Promise<RedactionResult> {
  const stage1 = redactPII(data);

  if (!config.comprehendEnabled) {
    return stage1;
  }

  const client = createComprehendClient(config.awsRegion);
  const typesFound = new Set<string>();
  const { result, count: stage2Count } = await redactRecursiveDeep(
    stage1.redactedData,
    client,
    typesFound,
  );

  return {
    redactedData: result,
    redactionCount: stage1.redactionCount + stage2Count,
    redactedTypes: [...new Set([...stage1.redactedTypes, ...typesFound])],
  };
}
