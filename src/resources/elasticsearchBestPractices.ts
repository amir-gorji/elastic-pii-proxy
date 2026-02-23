/**
 * **elasticsearch-best-practices** — Guidelines for constructing efficient, safe,
 * and compliant Elasticsearch queries in a banking context.
 *
 * Covers query construction, aggregation patterns, performance, security,
 * banking-specific considerations, result interpretation, compliance, and common mistakes.
 *
 * @module
 */
import type { Resource } from '@mastra/mcp';

export const resource: Resource = {
  uri: 'elastic-banking://resources/elasticsearch-best-practices',
  name: 'Elasticsearch Best Practices for Banking',
  description:
    'Guidelines for constructing efficient, safe, and compliant Elasticsearch queries ' +
    'in a banking context. Covers performance, security, compliance, and common mistakes.',
  mimeType: 'text/markdown',
};

export const content = `# Elasticsearch Best Practices for Banking

## 1. Query Construction

1. Always use \`bool\` queries with \`filter\` context for non-scoring conditions — filter clauses are cached and faster.
2. Prefer \`term\`/\`terms\` for keyword fields, \`match\` for text fields. Never use \`match\` on keyword fields.
3. Always include a time range filter on \`@timestamp\`. Unbounded queries on large indices will timeout or consume excessive resources.
4. Use \`_source\` filtering to return only needed fields when result sets are large.
5. Set a reasonable \`size\` parameter. Default to 10 for exploration, up to 100 for analysis. Never request more than you need.
6. Use \`sort\` when order matters — do not rely on default relevance scoring for operational queries.
7. Prefer \`filter\` context over \`must\` for conditions that do not need scoring (e.g., status=failed, type=SWIFT).
8. Use \`exists\` queries to check for field presence before aggregating on optional fields.

## 2. Aggregation Guidelines

9. Always set an explicit \`size\` on \`terms\` aggregations (default is 10). Use 20-50 for overview, never exceed 1000.
10. For high-cardinality fields, increase \`shard_size\` (2x the terms size) to improve accuracy at the cost of memory.
11. Use \`composite\` aggregations for paginating through large result sets instead of increasing terms size.
12. Limit aggregation nesting to 3 levels deep. Deeper nesting causes exponential memory usage.
13. Use \`filter\` aggregations for conditional metrics (e.g., count of failures within a date_histogram bucket).
14. Choose date_histogram intervals appropriate to the time range: minutes for hours, hours for days, days for months.
15. Use \`value_count\` for exact document counts. Use \`cardinality\` for approximate unique counts (HyperLogLog, ~1-6% error).

## 3. Performance

16. Avoid leading wildcards in queries (e.g., \`*search\`). They force a full index scan.
17. Narrow index patterns as much as possible. Use \`transactions-2024.01.*\` instead of \`transactions-*\` when the date range is known.
18. Prefer date math in index names when available (e.g., \`<logs-{now/d}>\`) to target specific indices.
19. Limit nested aggregation depth — each level multiplies the number of buckets.
20. Use the \`timeout\` parameter on searches to prevent runaway queries (e.g., \`"timeout": "30s"\`).
21. Avoid scripted fields in production queries. Pre-compute values at ingest time instead.
22. Sorting and aggregations use doc_values by default — this is efficient. Do not disable doc_values on fields you need to sort or aggregate.
23. Watch for high-cardinality \`terms\` aggregations (e.g., on transaction IDs). These consume significant memory.

## 4. Security

24. Never include write operations (\`_update\`, \`_delete\`, \`_bulk\`) in queries. This server is read-only.
25. Never use \`script\` queries or \`scripted_metric\` aggregations. They can execute arbitrary code.
26. Validate all field names against known mappings before querying to prevent injection attempts.
27. Do not query system indices (those starting with \`.\`) unless explicitly required.
28. Use index access patterns (\`ALLOWED_INDEX_PATTERNS\`) to restrict which indices can be queried.
29. Be cautious with regex queries — they can be computationally expensive and may be used for ReDoS attacks.
30. Never expose raw Elasticsearch error messages to end users. They may contain internal cluster details.
31. Always scope queries to the minimum required indices. Broad patterns increase the attack surface.

## 5. Banking-Specific Considerations

32. Always assume PII may be present in results. The server's PII redaction layer will mask it, but design queries to minimize PII exposure.
33. Use date math for regulatory retention periods (e.g., \`now-7y\` for 7-year PCI DSS requirement).
34. Include audit context in queries — who requested it, why, and the time range. This supports regulatory traceability.
35. Handle multi-currency amounts carefully. Never sum amounts across different currencies without grouping by currency first.
36. Be aware of timezone issues in date comparisons. Elasticsearch stores dates in UTC; banking operations may reference local time.
37. Consider data residency requirements. Some indices may contain data restricted to specific geographic regions.
38. Validate IBAN and SWIFT/BIC code formats when using them as filter criteria to catch typos early.
39. Handle partial transaction states (pending, processing) with care. They may represent in-flight operations that should not be aggregated as final.

## 6. Result Interpretation

40. \`total.value\` in search results may be approximate when \`track_total_hits\` is not set to \`true\`. The default lower bound is 10,000.
41. Check \`doc_count_error_upper_bound\` in terms aggregations. Non-zero values indicate the counts may be inaccurate.
42. Missing values in aggregations mean the field is absent in those documents, not that the value is zero.
43. \`date_histogram\` can produce empty buckets (count 0) when \`min_doc_count\` is 0 — this is useful for gap detection.
44. Shard failures (\`_shards.failed > 0\`) mean results are partial. Always check this field.
45. Aggregation results are approximate by design. For exact counts on high-cardinality data, use \`composite\` with pagination.

## 7. Compliance Patterns

46. PCI DSS Requirement 10: Maintain a complete audit trail of all access to cardholder data. Queries must return complete result sets.
47. GDPR Right of Access: When retrieving personal data, ensure the query captures all relevant indices and time ranges for completeness.
48. Retention policies differ by data classification. Verify the query time range falls within the data retention window.
49. Audit queries must be reproducible. Always document the exact DSL query, index pattern, and time range used.
50. Use \`track_total_hits: true\` for compliance queries to get exact counts, not approximations.

## 8. Common Mistakes to Avoid

51. Aggregating on text fields — always use the \`.keyword\` sub-field for aggregations.
52. Forgetting the \`.keyword\` suffix on string fields when filtering with \`term\`/\`terms\`.
53. Omitting time range filters — every production query should be time-bounded.
54. Requesting too many results with a large \`size\` — use aggregations for summaries instead.
55. Nesting more than 3 levels of aggregations — this causes exponential bucket growth.
56. Using \`match_all\` without any filters on large indices — this returns random documents.
57. Ignoring index lifecycle management — old indices may be frozen or deleted.
58. Not checking field types before querying — a \`match\` on a \`keyword\` field or \`term\` on a \`text\` field produces unexpected results.
`;
