/**
 * **banking-query-patterns** — Common Elasticsearch DSL query patterns for banking data.
 *
 * Provides the LLM with ready-to-use query examples for transaction searches,
 * time-series analysis, compliance queries, error analysis, and aggregation patterns.
 * This eliminates guesswork when constructing DSL queries against banking indices.
 *
 * @module
 */
import type { Resource } from '@mastra/mcp';

export const resource: Resource = {
  uri: 'kibana-banking://resources/banking-query-patterns',
  name: 'Banking Elasticsearch Query Patterns',
  description:
    'Common Elasticsearch DSL query patterns for banking data — transaction searches, ' +
    'aggregation patterns, compliance queries, time-series analysis, and field type guidance.',
  mimeType: 'text/markdown',
};

export const content = `# Banking Elasticsearch Query Patterns

## 1. Transaction Search Patterns

### Find failed transactions by payment type

\`\`\`json
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "status.keyword": "failed" } },
        { "term": { "payment_type.keyword": "SWIFT" } },
        { "range": { "@timestamp": { "gte": "now-24h" } } }
      ]
    }
  }
}
\`\`\`

### Find high-value transactions above a threshold

\`\`\`json
{
  "query": {
    "bool": {
      "filter": [
        { "range": { "amount": { "gte": 100000 } } },
        { "range": { "@timestamp": { "gte": "now-7d" } } }
      ]
    }
  },
  "sort": [{ "amount": "desc" }]
}
\`\`\`

### Search transactions by sender or receiver

\`\`\`json
{
  "query": {
    "bool": {
      "should": [
        { "term": { "sender_id.keyword": "ACCT-12345" } },
        { "term": { "receiver_id.keyword": "ACCT-12345" } }
      ],
      "minimum_should_match": 1,
      "filter": [
        { "range": { "@timestamp": { "gte": "now-30d" } } }
      ]
    }
  }
}
\`\`\`

## 2. Aggregation Patterns

### Transaction volume by currency

\`\`\`json
{
  "size": 0,
  "query": {
    "bool": {
      "filter": [
        { "range": { "@timestamp": { "gte": "now-24h" } } }
      ]
    }
  },
  "aggs": {
    "by_currency": {
      "terms": { "field": "currency.keyword", "size": 20 },
      "aggs": {
        "total_amount": { "sum": { "field": "amount" } },
        "avg_amount": { "avg": { "field": "amount" } },
        "tx_count": { "value_count": { "field": "_id" } }
      }
    }
  }
}
\`\`\`

### Failure rate by payment type

\`\`\`json
{
  "size": 0,
  "aggs": {
    "by_payment_type": {
      "terms": { "field": "payment_type.keyword" },
      "aggs": {
        "total": { "value_count": { "field": "_id" } },
        "failures": {
          "filter": {
            "terms": { "status.keyword": ["failed", "rejected"] }
          }
        }
      }
    }
  }
}
\`\`\`

### Top error codes with sample messages

\`\`\`json
{
  "size": 0,
  "query": {
    "bool": {
      "filter": [
        { "terms": { "status.keyword": ["failed", "rejected"] } }
      ]
    }
  },
  "aggs": {
    "top_errors": {
      "terms": { "field": "error_code.keyword", "size": 10 },
      "aggs": {
        "sample_messages": {
          "top_hits": {
            "size": 3,
            "_source": ["error_message", "@timestamp", "payment_type"]
          }
        }
      }
    }
  }
}
\`\`\`

## 3. Time-Series Analysis Patterns

### Hourly transaction volume

\`\`\`json
{
  "size": 0,
  "query": {
    "bool": {
      "filter": [
        { "range": { "@timestamp": { "gte": "now-24h" } } }
      ]
    }
  },
  "aggs": {
    "over_time": {
      "date_histogram": {
        "field": "@timestamp",
        "fixed_interval": "1h"
      },
      "aggs": {
        "total_amount": { "sum": { "field": "amount" } }
      }
    }
  }
}
\`\`\`

### Error rate over time (percentage)

\`\`\`json
{
  "size": 0,
  "aggs": {
    "over_time": {
      "date_histogram": {
        "field": "@timestamp",
        "fixed_interval": "1h"
      },
      "aggs": {
        "total": { "value_count": { "field": "_id" } },
        "errors": {
          "filter": {
            "terms": { "status.keyword": ["failed", "rejected", "error"] }
          }
        }
      }
    }
  }
}
\`\`\`

## 4. Compliance Query Patterns

### All access events for a specific user (PCI DSS Req 10)

\`\`\`json
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "user_id.keyword": "USER-ID-HERE" } },
        { "range": { "@timestamp": { "gte": "now-90d" } } }
      ]
    }
  },
  "sort": [{ "@timestamp": "asc" }],
  "size": 100
}
\`\`\`

### Detect unusual access volume by user

\`\`\`json
{
  "size": 0,
  "query": {
    "bool": {
      "filter": [
        { "range": { "@timestamp": { "gte": "now-24h" } } }
      ]
    }
  },
  "aggs": {
    "by_user": {
      "terms": {
        "field": "user_id.keyword",
        "size": 20,
        "order": { "_count": "desc" }
      }
    }
  }
}
\`\`\`

### Check for audit trail gaps (completeness verification)

\`\`\`json
{
  "size": 0,
  "query": {
    "bool": {
      "filter": [
        { "range": { "@timestamp": { "gte": "now-30d" } } }
      ]
    }
  },
  "aggs": {
    "hourly_coverage": {
      "date_histogram": {
        "field": "@timestamp",
        "fixed_interval": "1h",
        "min_doc_count": 0
      }
    }
  }
}
\`\`\`

## 5. Field Type Guidance

### When to use .keyword vs text fields

- Use \`.keyword\` for: terms aggregations, sorting, exact match filters, cardinality counts
- Use the text field for: full-text search with \`match\`, phrase queries with \`match_phrase\`
- **Never** aggregate on a text field — always use the \`.keyword\` sub-field
- Example: filter on \`status.keyword\`, but full-text search on \`error_message\`

### Common banking field type conventions

| Field | Typical Type | Notes |
|-------|-------------|-------|
| amount | \`double\` or \`scaled_float\` | Always filter/aggregate directly, never on text representation |
| currency | \`keyword\` | ISO 4217 codes (EUR, USD, GBP) |
| status | \`keyword\` | Enum-like values, use \`term\`/\`terms\` queries |
| @timestamp | \`date\` | Always include in range filters |
| error_message | \`text\` with \`.keyword\` | Use text for search, .keyword for aggregation |
| iban / swift_code | \`keyword\` | Exact match only |
| user_id | \`keyword\` | Exact match and terms aggregation |
`;
