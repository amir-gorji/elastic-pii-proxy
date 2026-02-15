/**
 * **performance-investigation** — Guided 8-step workflow for investigating
 * performance degradation in banking systems using Elasticsearch data.
 *
 * Covers APM traces, application logs, and transaction latency analysis.
 * Walks the LLM through telemetry discovery, baseline establishment,
 * degradation quantification, inflection point detection, cross-source
 * correlation, scope narrowing, impact summary, and action recommendations.
 *
 * @module
 */

const TEMPLATE = `# Performance Degradation Investigation

## Context
You are investigating: **{{SYMPTOM}}**
- Time window: \`{{TIME_RANGE}}\`
- Service focus: {{SERVICE_NAME}}

## Step 1: Discover Available Telemetry
Call \`discover_cluster\` to identify available indices. Look for:
- APM indices (apm-*, traces-*)
- Application logs (logs-*)
- Transaction data (transactions-*)
- Infrastructure metrics if available

## Step 2: Establish Baseline Performance
Query the time period BEFORE the issue started (double the time_range going back). Calculate baseline metrics:
- Average and p95 response/processing time
- Transaction throughput (events per minute)
- Error rate percentage

## Step 3: Quantify the Degradation
Query the \`{{TIME_RANGE}}\` window and calculate the same metrics. Compare against baseline:
- How much did latency increase?
- Did throughput drop?
- Did error rate change?
Use date_histogram to plot the trend.

## Step 4: Identify the Inflection Point
Use a narrow date_histogram (1-minute buckets) to find when performance started degrading. Look for:
- Step function (sudden change = deployment or configuration)
- Gradual increase (resource exhaustion, data growth)
- Oscillating pattern (load-dependent, garbage collection)

## Step 5: Correlate Across Data Sources
{{SERVICE_NAME}} focus — search across index types:
- If APM data exists: look for slow spans, external call latency
- If logs exist: look for error spikes, warning patterns, connection pool exhaustion
- If transaction data exists: check if specific transaction types are affected

## Step 6: Narrow the Scope
Based on findings so far, build targeted queries:
- Filter by the specific error codes or slow operations identified
- Aggregate by downstream dependency to find the bottleneck
- Check if the issue affects all users or specific segments

## Step 7: Summarize Impact
Present a structured impact assessment:
1. **Duration**: When it started, whether it is ongoing
2. **Severity**: Quantified degradation vs baseline
3. **Scope**: Which services, transactions, or users are affected
4. **Likely cause**: Based on correlation analysis

## Step 8: Recommend Actions
Based on the investigation:
- Immediate mitigation steps
- Specific system components to examine
- Additional data to collect if root cause is not yet clear
- Monitoring queries to track recovery
`;

/** Prompt metadata exposed via MCP prompts/list. */
export const prompt = {
  name: 'performance-investigation',
  description:
    'Guided 8-step workflow for investigating performance degradation in banking ' +
    'systems. Covers APM traces, application logs, and transaction latency analysis ' +
    'with baseline comparison and cross-source correlation.',
  arguments: [
    {
      name: 'symptom',
      description: 'Description of the performance issue (e.g., "payment processing latency increased 3x", "API response times over 5s")',
      required: true,
    },
    {
      name: 'time_range',
      description: 'Time window to investigate, e.g. "now-6h", "now-24h" (default: now-6h)',
      required: false,
    },
    {
      name: 'service_name',
      description: 'Specific service or microservice to focus on, if known',
      required: false,
    },
  ],
};

/** Fills template placeholders and returns MCP PromptMessage array. */
export function getMessages(
  args: Record<string, string | undefined> = {},
): { role: 'user'; content: { type: 'text'; text: string } }[] {
  const filled = TEMPLATE
    .replace(/\{\{SYMPTOM\}\}/g, args.symptom ?? 'Unknown performance issue')
    .replace(/\{\{TIME_RANGE\}\}/g, args.time_range ?? 'now-6h')
    .replace(/\{\{SERVICE_NAME\}\}/g, args.service_name ?? 'All services');

  return [{ role: 'user', content: { type: 'text', text: filled } }];
}
