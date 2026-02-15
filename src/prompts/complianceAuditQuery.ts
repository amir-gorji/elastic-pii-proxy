/**
 * **compliance-audit-query** — Guided 7-step workflow for building compliance-grade
 * audit queries that satisfy PCI DSS and GDPR requirements.
 *
 * Walks the LLM through schema discovery, completeness verification, scoped query
 * construction, result validation, cross-referencing, audit summary generation,
 * and query reproducibility documentation.
 *
 * @module
 */

const TEMPLATE = `# Compliance Audit Query Builder

## Context
You are building audit queries for: **{{AUDIT_SCOPE}}**
- Audit period: \`{{TIME_RANGE}}\`
- Index pattern: \`{{INDEX_PATTERN}}\`

## Step 1: Discover Audit Data Schema
Call \`discover_cluster\` with pattern \`{{INDEX_PATTERN}}\`. Identify fields relevant to:
- User identity (username, user_id, role, department)
- Action performed (action, event_type, operation)
- Resource accessed (index, document_id, resource)
- Timestamp and session info (@timestamp, session_id, source_ip)
- Outcome (status, result, error)

## Step 2: Establish Completeness Baseline
Before querying for specific events, verify data completeness:
- Count total audit events in the \`{{TIME_RANGE}}\` window
- Check for gaps using a date_histogram with 1-hour buckets and min_doc_count: 0
- Flag any hours with zero events (potential data loss)
Compliance audits require demonstrating no gaps in the audit trail.

## Step 3: Build the Scoped Query
Construct the query for "{{AUDIT_SCOPE}}":
- Use bool query with must/filter clauses for the specific audit scope
- Always include the time range filter on @timestamp
- Include all relevant fields in _source (do not use partial source filtering)
- Set size appropriately — audits often need complete result sets
- Use \`track_total_hits: true\` for exact counts

## Step 4: Validate Result Completeness
After executing the query:
- Compare total hits against expected volume
- Verify the time range is fully covered (first and last event timestamps)
- Check for any missing required fields in the results

## Step 5: Cross-Reference with Secondary Sources
If available, query related indices to corroborate findings:
- Application logs (logs-*) for the same time window
- APM traces (apm-*) for system-level access records
- Note any discrepancies between audit trail and application logs

## Step 6: Generate Audit Summary
Present results in audit-ready format:
1. **Scope**: What was audited and the time period
2. **Data completeness**: Any gaps or anomalies in the audit trail
3. **Findings**: Key events matching the audit criteria
4. **Statistics**: Event counts, unique users, access patterns
5. **Anomalies**: Unusual patterns that warrant further investigation

## Step 7: Document Query Reproducibility
Record the exact DSL queries used so the audit can be reproduced:
- Include the full query body for each search executed
- Note the index patterns and time ranges used
- This satisfies PCI DSS Requirement 10 (track and monitor access)
`;

/** Prompt metadata exposed via MCP prompts/list. */
export const prompt = {
  name: 'compliance-audit-query',
  description:
    'Guided 7-step workflow for building compliance-grade audit queries. ' +
    'Helps construct Elasticsearch queries that satisfy PCI DSS and GDPR audit ' +
    'requirements with completeness checks and reproducibility documentation.',
  arguments: [
    {
      name: 'audit_scope',
      description: 'What is being audited (e.g., "access to cardholder data", "data deletion requests", "privileged user actions")',
      required: true,
    },
    {
      name: 'time_range',
      description: 'Audit period (e.g., "now-30d", "now-90d")',
      required: true,
    },
    {
      name: 'index_pattern',
      description: 'Index pattern containing audit trail data (default: audit-*)',
      required: false,
    },
  ],
};

/** Fills template placeholders and returns MCP PromptMessage array. */
export function getMessages(
  args: Record<string, string | undefined> = {},
): { role: 'user'; content: { type: 'text'; text: string } }[] {
  const filled = TEMPLATE
    .replace(/\{\{AUDIT_SCOPE\}\}/g, args.audit_scope ?? 'General audit')
    .replace(/\{\{TIME_RANGE\}\}/g, args.time_range ?? 'now-30d')
    .replace(/\{\{INDEX_PATTERN\}\}/g, args.index_pattern ?? 'audit-*');

  return [{ role: 'user', content: { type: 'text', text: filled } }];
}
