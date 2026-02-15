/**
 * **banking-domain-glossary** — Maps banking domain terminology to Elasticsearch
 * field names, query patterns, and index conventions.
 *
 * Helps the LLM translate business language ("failed SWIFT payments last week")
 * into precise Elasticsearch DSL queries against the correct indices and fields.
 *
 * @module
 */
import type { Resource } from '@mastra/mcp';

export const resource: Resource = {
  uri: 'kibana-banking://resources/banking-domain-glossary',
  name: 'Banking Domain Glossary',
  description:
    'Maps banking domain terminology to Elasticsearch field names and query patterns. ' +
    'Covers payment types, transaction statuses, compliance terms, index patterns, ' +
    'business metrics, and time expressions.',
  mimeType: 'text/markdown',
};

export const content = `# Banking Domain Glossary

## Payment Types

### SWIFT (MT103)
International wire transfer via the SWIFT network.
- Typical fields: \`payment_type: "SWIFT"\`, \`swift_code\`, \`beneficiary_bank_bic\`, \`sender_bic\`
- Query pattern: \`{ "term": { "payment_type.keyword": "SWIFT" } }\`
- Common statuses: initiated, processing, completed, failed, rejected
- Processing time: typically minutes to hours, can take 1-3 business days for correspondent banking

### SEPA (Single Euro Payments Area)
European payment standard — SCT for credit transfers, SDD for direct debits.
- Typical fields: \`payment_type: "SEPA"\`, \`iban\`, \`mandate_id\`, \`sepa_type\` (SCT/SDD)
- Query pattern: \`{ "term": { "payment_type.keyword": "SEPA" } }\`
- Common statuses: initiated, accepted, settled, rejected, returned
- Processing time: SCT typically same-day or next business day; SDD follows mandate cycles

### Card Payment
Debit or credit card transactions (POS, online, ATM).
- Typical fields: \`payment_type: "CARD"\`, \`card_type\` (debit/credit), \`merchant_category_code\`, \`terminal_id\`
- Query pattern: \`{ "term": { "payment_type.keyword": "CARD" } }\`
- Note: Card numbers (PAN) should never appear in full — PII redaction masks them automatically

### Internal Transfer
Account-to-account transfers within the same bank.
- Typical fields: \`payment_type: "INTERNAL"\`, \`sender_account\`, \`receiver_account\`
- Usually completed instantly or within minutes

## Transaction Statuses

| Status | Meaning | Query |
|--------|---------|-------|
| \`initiated\` | Transaction created, not yet processed | \`{ "term": { "status.keyword": "initiated" } }\` |
| \`pending\` | Awaiting approval or processing | \`{ "term": { "status.keyword": "pending" } }\` |
| \`processing\` | Currently being executed | \`{ "term": { "status.keyword": "processing" } }\` |
| \`completed\` | Successfully finished | \`{ "term": { "status.keyword": "completed" } }\` |
| \`failed\` | Processing failed (technical error) | \`{ "term": { "status.keyword": "failed" } }\` |
| \`rejected\` | Rejected by rules/compliance/bank | \`{ "term": { "status.keyword": "rejected" } }\` |
| \`reversed\` | Transaction reversed after completion | \`{ "term": { "status.keyword": "reversed" } }\` |
| \`cancelled\` | Cancelled before processing | \`{ "term": { "status.keyword": "cancelled" } }\` |

### Querying for failures (multiple statuses)
\`\`\`json
{ "terms": { "status.keyword": ["failed", "rejected"] } }
\`\`\`

### Querying for successful completions
\`\`\`json
{ "term": { "status.keyword": "completed" } }
\`\`\`

## Compliance Terms

### PCI DSS (Payment Card Industry Data Security Standard)
- Relevant to: cardholder data access, audit logging, encryption
- Key requirement: Requirement 10 — track and monitor all access to network resources and cardholder data
- Audit index: typically \`audit-*\`
- Retention: minimum 1 year, 3 months immediately available

### GDPR (General Data Protection Regulation)
- Relevant to: personal data access, deletion requests (right to erasure), consent records
- Key queries: find all records for a data subject, verify deletion completeness
- Affected fields: any PII — names, emails, IBANs, phone numbers, addresses

### AML (Anti-Money Laundering)
- Relevant to: transaction monitoring, suspicious activity detection, sanctions screening
- Key patterns: high-value transactions, unusual frequency, structuring (just-below-threshold amounts)
- Query approach: aggregate by account + time window, look for outliers

### KYC (Know Your Customer)
- Relevant to: customer onboarding, identity verification status, document checks
- Typical index: \`customers-*\` or \`kyc-*\`

## Common Index Patterns

| Pattern | Contains | Typical Use |
|---------|----------|-------------|
| \`transactions-*\` | Payment and transfer records | Transaction search, volume analysis, failure investigation |
| \`audit-*\` | System and user audit trail events | Compliance queries, access tracking, change history |
| \`logs-*\` | Application and infrastructure logs | Error investigation, debugging, performance analysis |
| \`apm-*\` | Application Performance Monitoring traces | Latency analysis, service dependency mapping |
| \`customers-*\` | Customer profile and KYC data | Customer lookup, onboarding metrics |
| \`alerts-*\` | Monitoring and rule-triggered alerts | Alert history, false positive analysis |

## Business Metrics

### Transaction Volume
- Definition: Count of documents in a transactions index within a time range
- Query: \`size: 0\` with \`value_count\` or just check \`total.value\` from search results
- Breakdown: use \`terms\` aggregation on \`payment_type.keyword\`, \`currency.keyword\`, or \`status.keyword\`

### Failure Rate
- Definition: (failed + rejected count) / total count, expressed as a percentage
- Query: \`filter\` aggregation for failures within a \`date_histogram\` bucket
- Warning: always calculate per payment type — mixing types produces misleading rates

### Processing Latency
- Definition: time between \`initiated_at\` (or \`created_at\`) and \`completed_at\` timestamps
- Query: use \`scripted_metric\` or pre-computed \`processing_time_ms\` field if available
- Recommended: aggregate with \`avg\`, \`percentiles\` (p50, p95, p99), and \`max\`

### Settlement Time
- Definition: time from transaction completion to settlement confirmation
- Relevant for: SWIFT and SEPA transactions where settlement is asynchronous

### Throughput
- Definition: transactions per unit time (per minute, per hour)
- Query: \`date_histogram\` with appropriate interval, count per bucket

## Time Expressions for Elasticsearch

### Relative (most common for operations)
- \`now-1h\` — last hour
- \`now-24h\` — last 24 hours
- \`now-7d\` — last 7 days
- \`now-30d\` — last 30 days
- \`now-90d\` — last quarter
- \`now-1y\` — last year

### Rounded (for clean boundaries)
- \`now/d\` — start of today (midnight UTC)
- \`now-1d/d\` — start of yesterday
- \`now/w\` — start of this week
- \`now-1M/M\` — start of last month
- \`now/y\` — start of this year

### Absolute (for audits and reports)
- \`2024-01-01T00:00:00Z\` — specific UTC timestamp
- Use absolute dates for reproducible audit queries

### Range filter syntax
\`\`\`json
{
  "range": {
    "@timestamp": {
      "gte": "now-24h",
      "lte": "now"
    }
  }
}
\`\`\`
`;
