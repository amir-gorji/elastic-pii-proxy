/**
 * **investigate-failed-transactions** — Guided 8-step workflow for investigating
 * failed or rejected banking transactions (SWIFT, SEPA, card payments).
 *
 * Walks the LLM through cluster discovery, failure volume assessment, pattern
 * identification, sample examination, comparison with successes, temporal
 * correlation, summary, and remediation recommendations.
 *
 * @module
 */

const TEMPLATE = `# Investigate Failed Banking Transactions

## Context
You are investigating the following issue: **{{FAILURE_DESCRIPTION}}**
- Index pattern: \`{{INDEX_PATTERN}}\`
- Time window: \`{{TIME_RANGE}}\`

## Step 1: Discover Available Data
Call \`discover_cluster\` with pattern \`{{INDEX_PATTERN}}\` to understand what indices exist and what fields are available. Pay attention to fields related to: status, error_code, error_message, payment_type, amount, currency, sender, receiver, processing_time.

## Step 2: Assess Failure Volume
Use \`kibana_search\` to get an overview of failure counts. Build a query that:
- Filters for failed/rejected/error statuses in the \`{{TIME_RANGE}}\` window
- Uses a \`terms\` aggregation on the status field to see the distribution
- Uses a \`date_histogram\` aggregation to see if failures are clustered in time

## Step 3: Identify Failure Patterns
Drill into the failures by building queries that aggregate on:
- Error codes or error message fields (top 10)
- Payment type (SWIFT vs SEPA vs card)
- Currency and corridor (sender country -> receiver country)
Look for concentration — are failures spread evenly or clustered?

## Step 4: Examine Sample Failures
Retrieve 5-10 sample failed transactions with full \`_source\` to understand the error details. Look for common patterns in error messages, amounts, or counterparties.

## Step 5: Compare with Successful Transactions
Query successful transactions in the same time window. Compare:
- Average processing time (successful vs failed)
- Distribution across payment types
- Any fields present in failures but absent in successes

## Step 6: Check for Temporal Correlation
Look for a specific start time for the failures using a narrow date_histogram (1-minute or 5-minute buckets). Determine if this was a sudden spike or gradual degradation. If there is a clear start time, note it for correlation with deployments or infrastructure changes.

## Step 7: Summarize Findings
Present a structured summary:
1. **Volume**: How many transactions failed in the window
2. **Pattern**: What the failures have in common
3. **Timeline**: When failures started and whether they are ongoing
4. **Affected scope**: Which payment types, currencies, or corridors are impacted

## Step 8: Recommend Next Steps
Based on findings, suggest:
- Immediate actions (e.g., check specific upstream systems, review recent deployments)
- Queries to run in related indices (audit-*, logs-*, apm-*) for correlation
- Monitoring alerts to set up for early detection
`;

/** Prompt metadata exposed via MCP prompts/list. */
export const prompt = {
  name: 'investigate-failed-transactions',
  description:
    'Guided 8-step workflow to investigate failed or rejected banking transactions ' +
    '(SWIFT, SEPA, card). Walks through cluster discovery, pattern identification, ' +
    'root cause analysis, and remediation recommendations.',
  arguments: [
    {
      name: 'failure_description',
      description: 'Description of the failure being investigated (e.g., "SWIFT payments timing out", "SEPA rejections spiking")',
      required: true,
    },
    {
      name: 'index_pattern',
      description: 'Elasticsearch index pattern containing transaction data (default: transactions-*)',
      required: false,
    },
    {
      name: 'time_range',
      description: 'Time window to investigate, e.g. "now-24h", "now-7d" (default: now-24h)',
      required: false,
    },
  ],
};

/** Fills template placeholders and returns MCP PromptMessage array. */
export function getMessages(
  args: Record<string, string | undefined> = {},
): { role: 'user'; content: { type: 'text'; text: string } }[] {
  const filled = TEMPLATE
    .replace(/\{\{FAILURE_DESCRIPTION\}\}/g, args.failure_description ?? 'Unknown failure')
    .replace(/\{\{INDEX_PATTERN\}\}/g, args.index_pattern ?? 'transactions-*')
    .replace(/\{\{TIME_RANGE\}\}/g, args.time_range ?? 'now-24h');

  return [{ role: 'user', content: { type: 'text', text: filled } }];
}
