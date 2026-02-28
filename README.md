# elastic-pii-proxy

A **transparent MCP proxy** that sits between an LLM agent and an upstream MCP server (Elastic v8.18+, or any other). Intercepts tool calls and resource reads, redacts PII before results reach the model, and emits a GDPR-correct audit trail — raw PII never touches the audit log.

Built as a composable middleware stack: each concern (PII redaction, audit logging, compliance profiles) is a pluggable brick. The proxy core is generic and reusable for any upstream MCP server.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Quick Start](#2-quick-start)
3. [Environment Variables](#3-environment-variables)
4. [Compliance Profiles](#4-compliance-profiles)
5. [Middleware Execution Order](#5-middleware-execution-order)
6. [Adding a Middleware](#6-adding-a-middleware)
7. [Security & Compliance](#7-security--compliance)
8. [Testing](#8-testing)
9. [Project Structure](#9-project-structure)
10. [License](#10-license)

---

## 1. Architecture

```
┌─────────────┐  MCP (stdio)  ┌────────────────────────────────────────┐  MCP (stdio)  ┌──────────────────┐
│  LLM Agent  │ ◄────────────► │           elastic-pii-proxy            │ ◄────────────► │  Elastic MCP     │
│  (Claude)   │               │                                        │               │  (v8.18+)        │
└─────────────┘               │  compose([auditMW, piiMW])             │               └──────────────────┘
                              │                                        │
                              │  ┌──────────────────────────────────┐  │
                              │  │  auditMiddleware  (outer layer)  │  │
                              │  │  ┌──────────────────────────┐    │  │
                              │  │  │  piiMiddleware  (inner)  │    │  │
                              │  │  │   ┌──────────────────┐   │    │  │
                              │  │  │   │  upstream call   │   │    │  │
                              │  │  │   └──────────────────┘   │    │  │
                              │  │  │  ↑ redact response here  │    │  │
                              │  │  └──────────────────────────┘    │  │
                              │  │  ↑ log AFTER redaction (safe)    │  │
                              │  └──────────────────────────────────┘  │
                              └────────────────────────────────────────┘
```

**Execution order** with `compose([auditMW, piiMW])`:

| Step | Layer | Action |
|------|-------|--------|
| 1 | auditMW enter | capture `startTime` |
| 2 | piiMW enter | call upstream |
| 3 | — | upstream Elastic MCP returns raw data |
| 4 | piiMW exit | redact PII from response |
| 5 | auditMW exit | log **clean** result + timing (never logs raw PII) |

---

## 2. Quick Start

### Prerequisites

- Node.js 18+
- Elasticsearch v8.18+ with the native MCP server enabled (or any other MCP server)

### Install & Build

```bash
git clone <this-repo>
cd elastic-pii-proxy
npm install
npm run build:mcp
```

### Configure (stdio upstream)

```bash
export UPSTREAM_MCP_COMMAND="node"
export UPSTREAM_MCP_ARGS="/path/to/elastic-mcp/index.mjs"
export COMPLIANCE_PROFILE="GDPR"
```

### Connect to Claude Desktop

```json
{
  "mcpServers": {
    "elastic-pii-proxy": {
      "command": "node",
      "args": ["/absolute/path/to/dist/stdio.mjs"],
      "env": {
        "UPSTREAM_MCP_COMMAND": "node",
        "UPSTREAM_MCP_ARGS": "/path/to/elastic-mcp/index.mjs",
        "COMPLIANCE_PROFILE": "GDPR",
        "AUDIT_ENABLED": "true"
      }
    }
  }
}
```

---

## 3. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UPSTREAM_MCP_COMMAND` | one of the two | — | Command to spawn the upstream MCP server (e.g., `node`) |
| `UPSTREAM_MCP_ARGS` | — | `""` | Space-separated args for the upstream command |
| `UPSTREAM_MCP_URL` | one of the two | — | HTTP/SSE URL of an already-running upstream MCP server |
| `COMPLIANCE_PROFILE` | — | `GDPR` | Active compliance profile: `GDPR` \| `DORA` \| `PCI_DSS` \| `full` |
| `AUDIT_ENABLED` | — | `true` | Emit structured JSON audit entries to stderr |
| `COMPREHEND_ENABLED` | — | `false` | Enable Stage 2 AWS Comprehend NER redaction |
| `AWS_REGION` | — | `us-east-1` | AWS region for Comprehend API calls |

Either `UPSTREAM_MCP_COMMAND` or `UPSTREAM_MCP_URL` must be set; the proxy throws at startup if neither is provided.

---

## 4. Compliance Profiles

A compliance profile selects which redaction stages are active.

| Profile | Stage 1 (regex) | Stage 2 (Comprehend NER) | Focus |
|---------|-----------------|--------------------------|-------|
| `GDPR` | ✓ | ✓ (when enabled) | Names, addresses, dates, passport/driver IDs |
| `DORA` | ✓ | ✗ | Regex-only; operational/financial data |
| `PCI_DSS` | ✓ | ✗ | Regex-only; payment card data focus |
| `full` | ✓ | ✓ (when enabled) | All stages, all entity types |

**Stage 1 — synchronous regex** always runs when enabled. Covers:

| PII Type    | Example Input            | Masked Output          |
|-------------|--------------------------|------------------------|
| Credit card | `4111 1111 1111 1111`    | `**** **** **** 1111`  |
| IBAN        | `DE89370400440532013000` | `DE89****3000`         |
| SSN         | `123-45-6789`            | `***-**-****`          |
| Email       | `john.doe@bank.com`      | `j***@bank.com`        |
| Phone       | `+1 555-123-4567`        | `+15***67`             |

Credit card detection uses Luhn validation to avoid false positives on random 16-digit sequences.

**Stage 2 — AWS Comprehend NER** runs when both `COMPREHEND_ENABLED=true` and the profile has `stage2: true`. Catches contextual PII that regex cannot:

| PII Type    | Example             | Masked Output           |
|-------------|---------------------|-------------------------|
| Full name   | `John Doe`          | `[REDACTED:NAME]`       |
| Address     | `42 Main St`        | `[REDACTED:ADDRESS]`    |
| IP address  | `192.168.1.101`     | `[REDACTED:IP_ADDRESS]` |

---

## 5. Middleware Execution Order

The pipeline is built with `compose([auditMW, piiToolMW])` — a Koa-style onion model where the **first element is the outermost layer**.

```
compose([auditMW, piiMW])

Request in ──► auditMW.enter ──► piiMW.enter ──► upstream
                                                     │
Response  ◄── auditMW.exit  ◄── piiMW.exit  ◄───────┘
             (logs clean)       (redacts PII)
```

This ordering guarantees that the audit trail never contains raw PII — it reads from the already-redacted result that `piiMW` returns.

The composed pipeline for resource reads is `compose([piiResourceMW])` — no audit middleware there, since resources are static reference content (not query results).

---

## 6. Adding a Middleware

Every middleware is a pure function — no class inheritance, no global state.

```typescript
import type { Middleware } from './src/proxy/middleware.js';
import type { CallToolRequest, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// 1. Define the type alias for readability
type ToolCallMiddleware = Middleware<CallToolRequest, CallToolResult>;

// 2. Write a factory function that returns the middleware
export function createMyMiddleware(config: MyConfig): ToolCallMiddleware {
  return async (req, next) => {
    // — before upstream —
    const result = await next(req);
    // — after upstream (result is already processed by inner layers) —
    return result;
  };
}
```

```typescript
// 3. Wire it into the pipeline in src/mastra/stdio.ts
import { compose } from './proxy/middleware.js';

const myMW = createMyMiddleware(myConfig);

// Outermost first — myMW sees the result after piiMW has already redacted it
const toolPipeline = compose([auditMW, myMW, piiToolMW]);
```

Middlewares can:
- **Transform the request** before passing to `next` (e.g., add metadata)
- **Transform the response** after `next` returns (e.g., redact, filter, enrich)
- **Short-circuit** (return early without calling `next`, e.g., cache hit)
- **Handle errors** (catch from `next`, log, re-throw or return an error result)

---

## 7. Security & Compliance

### Audit Trail

Every tool call produces a structured JSON line to stderr **after** PII redaction:

```json
{
  "timestamp": "2026-02-15T10:30:00.000Z",
  "upstream_tool": "elastic_search",
  "compliance_profile": "GDPR",
  "input_parameters": "{\"index\":\"transactions-*\",...}",
  "output_size_bytes": 4521,
  "redaction_count": 3,
  "redacted_types": ["credit_card", "email"],
  "execution_time_ms": 245,
  "status": "success"
}
```

Input parameters are truncated at 500 characters. The audit log never contains raw PII — it always reflects the post-redaction state.

### Zero raw PII in logs

Audit middleware is the **outer** layer (`compose([auditMW, piiMW])`). By the time `auditMW.exit` runs, `piiMW` has already redacted the response. This is enforced structurally by the compose order, not by convention.

---

## 8. Testing

```bash
# Unit tests (52 tests across 7 files)
npm test

# Manual PII redaction demo (no upstream needed)
npm run test:redaction

# Build
npm run build:mcp
```

Test coverage:

| File | What is tested |
|------|----------------|
| `src/proxy/__tests__/middleware.test.ts` | `compose()` ordering, error propagation, double-next guard |
| `src/middlewares/__tests__/complianceProfiles.test.ts` | Profile selection, stage flags, unknown-profile fallback |
| `src/middlewares/__tests__/piiRedaction.test.ts` | Email/SSN redaction, non-text passthrough, error result passthrough, metadata injection |
| `src/middlewares/__tests__/audit.test.ts` | Log format, post-redaction ordering, error logging, disabled logger |
| `src/lib/__tests__/auditLogger.test.ts` | JSON format, truncation, stderr routing |
| `src/lib/__tests__/piiRedaction.test.ts` | Pattern accuracy, Luhn validation, recursive traversal |
| `src/lib/__tests__/comprehendClient.test.ts` | Chunking, entity redaction, pre-filter short-circuit |

---

## 9. Project Structure

```
src/
├── lib/
│   ├── config.ts               # ProxyConfig — env var loader
│   ├── auditLogger.ts          # AuditLogger — structured JSON to stderr
│   ├── piiRedaction.ts         # Stage 1 regex redaction engine
│   ├── comprehendClient.ts     # Stage 2 AWS Comprehend NER wrapper
│   ├── types.ts                # ToolResult<T> discriminated union (dismatch)
│   └── __tests__/
├── proxy/
│   ├── middleware.ts           # Middleware<Req,Res> type + compose()
│   ├── backendClient.ts        # createBackendClient() — MCP SDK Client factory
│   ├── core.ts                 # startProxy() — wires MCPServer + backend + pipelines
│   └── __tests__/
├── middlewares/
│   ├── complianceProfiles.ts   # Profile definitions + getProfile()
│   ├── piiRedaction.ts         # createPiiToolMiddleware() + createPiiResourceMiddleware()
│   ├── audit.ts                # createAuditMiddleware()
│   └── __tests__/
└── mastra/
    └── stdio.ts                # Entry point — composes pipeline, boots proxy
scripts/
└── test-redaction.ts           # Manual PII demo script
```

---

## 10. License

MIT — free to use, modify, and distribute.
