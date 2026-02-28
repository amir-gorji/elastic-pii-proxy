/**
 * Entry point for the elastic-pii-proxy MCP server.
 *
 * Composes the middleware pipeline and boots the proxy via mcpose:
 *
 *   toolMiddleware: [piiToolMW, auditMW]
 *
 * Execution order (response-processing order — first element processes response first):
 *   1. auditMW enter   → record start time
 *   2. piiToolMW enter → call upstream
 *   3. upstream returns raw data
 *   4. piiToolMW exit  → redact PII
 *   5. auditMW exit    → log clean result (never logs raw PII)
 */
import { createBackendClient, startProxy } from 'mcpose';
import { loadConfig } from './lib/config.js';
import { AuditLogger } from './lib/auditLogger.js';
import { getProfile } from './middlewares/complianceProfiles.js';
import {
  createPiiToolMiddleware,
  createPiiResourceMiddleware,
} from './middlewares/piiRedaction.js';
import { createAuditMiddleware } from './middlewares/audit.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const profile = getProfile(config.complianceProfile);
  const logger = new AuditLogger(config);

  const auditMW = createAuditMiddleware(logger, profile.name);
  const piiToolMW = createPiiToolMiddleware(config, profile);
  const piiResourceMW = createPiiResourceMiddleware(config, profile);

  const client = await createBackendClient({
    command: config.command,
    args: config.args,
    url: config.url,
  });

  await startProxy(client, {
    toolMiddleware: [piiToolMW, auditMW], // pii redacts first, audit logs clean data
    resourceMiddleware: [piiResourceMW],
  });
}

main().catch((error) => {
  process.stderr.write(`[elastic-pii-proxy] Fatal error: ${error}\n`);
  process.exit(1);
});
