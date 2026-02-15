/**
 * Prompts registry — exposes guided multi-step workflows via the MCP
 * prompts protocol.
 *
 * Each prompt is a markdown template with {{PLACEHOLDER}} substitution that
 * guides the LLM through a structured investigation or analysis workflow
 * using the server's tools.
 *
 * @module
 */
import type { MCPServerPrompts } from '@mastra/mcp';

import {
  prompt as investigateFailedTransactionsPrompt,
  getMessages as getInvestigateFailedTransactionsMessages,
} from './investigateFailedTransactions';
import {
  prompt as complianceAuditQueryPrompt,
  getMessages as getComplianceAuditQueryMessages,
} from './complianceAuditQuery';
import {
  prompt as performanceInvestigationPrompt,
  getMessages as getPerformanceInvestigationMessages,
} from './performanceInvestigation';

const promptList = [
  investigateFailedTransactionsPrompt,
  complianceAuditQueryPrompt,
  performanceInvestigationPrompt,
];

const messageResolvers: Record<
  string,
  (args: Record<string, string | undefined>) => { role: 'user'; content: { type: 'text'; text: string } }[]
> = {
  'investigate-failed-transactions': getInvestigateFailedTransactionsMessages,
  'compliance-audit-query': getComplianceAuditQueryMessages,
  'performance-investigation': getPerformanceInvestigationMessages,
};

export const allPrompts: MCPServerPrompts = {
  listPrompts: async () => promptList,
  getPromptMessages: async ({ name, args }) => {
    const resolver = messageResolvers[name];
    if (!resolver) {
      throw new Error(`Unknown prompt: "${name}"`);
    }
    return resolver(args ?? {});
  },
};
