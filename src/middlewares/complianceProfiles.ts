/**
 * Compliance profile definitions.
 *
 * A profile configures which PII redaction stages are active and which
 * AWS Comprehend entity types to redact in Stage 2.
 *
 * Profiles:
 *  - **GDPR**    – full two-stage redaction (regex + NER) with personal data focus.
 *  - **DORA**    – regex-only; financial operational data, lighter NER requirements.
 *  - **PCI_DSS** – regex-only; focused on payment card data.
 *  - **full**    – all stages enabled, all entity types.
 *
 * @module
 */

/** Configuration for a compliance profile. */
export interface ComplianceProfile {
  /** Human-readable profile name (matches the key). */
  readonly name: string;
  /** Whether to run Stage 1 synchronous regex redaction. */
  readonly stage1: boolean;
  /** Whether to run Stage 2 async AWS Comprehend NER redaction. */
  readonly stage2: boolean;
  /**
   * Subset of Comprehend entity types to redact in Stage 2.
   * When `undefined`, all entity types handled by the comprehend client are used.
   */
  readonly comprehendEntityTypes?: readonly string[];
}

const PROFILES: Readonly<Record<string, ComplianceProfile>> = {
  GDPR: {
    name: 'GDPR',
    stage1: true,
    stage2: true,
    comprehendEntityTypes: [
      'NAME',
      'ADDRESS',
      'DATE_TIME',
      'PASSPORT_NUMBER',
      'DRIVER_ID',
    ],
  },
  DORA: {
    name: 'DORA',
    stage1: true,
    stage2: false,
  },
  PCI_DSS: {
    name: 'PCI_DSS',
    stage1: true,
    stage2: false,
  },
  full: {
    name: 'full',
    stage1: true,
    stage2: true,
  },
} as const;

/**
 * Retrieves a compliance profile by name.
 *
 * Falls back to `GDPR` for unknown names and logs a warning.
 *
 * @param name - Profile name (case-sensitive): `GDPR` | `DORA` | `PCI_DSS` | `full`.
 * @returns The matching {@link ComplianceProfile}.
 */
export function getProfile(name: string): ComplianceProfile {
  const profile = PROFILES[name];
  if (!profile) {
    process.stderr.write(
      `[elastic-pii-proxy] Unknown compliance profile "${name}", falling back to GDPR\n`,
    );
    return PROFILES['GDPR']!;
  }
  return profile;
}

/** All registered profile names. */
export const PROFILE_NAMES = Object.keys(PROFILES) as ReadonlyArray<string>;
