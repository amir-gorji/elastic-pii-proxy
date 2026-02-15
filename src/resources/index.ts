/**
 * Resources registry — exposes static banking domain reference material
 * via the MCP resources protocol.
 *
 * Resources provide the LLM with domain knowledge (query patterns, best
 * practices, glossary) without consuming tool calls.
 *
 * @module
 */
import type { MCPServerResources } from '@mastra/mcp';

import {
  resource as bankingQueryPatternsResource,
  content as bankingQueryPatternsContent,
} from './bankingQueryPatterns';
import {
  resource as elasticsearchBestPracticesResource,
  content as elasticsearchBestPracticesContent,
} from './elasticsearchBestPractices';
import {
  resource as bankingDomainGlossaryResource,
  content as bankingDomainGlossaryContent,
} from './bankingDomainGlossary';

const resourceList = [
  bankingQueryPatternsResource,
  elasticsearchBestPracticesResource,
  bankingDomainGlossaryResource,
];

const contentMap: Record<string, string> = {
  [bankingQueryPatternsResource.uri]: bankingQueryPatternsContent,
  [elasticsearchBestPracticesResource.uri]: elasticsearchBestPracticesContent,
  [bankingDomainGlossaryResource.uri]: bankingDomainGlossaryContent,
};

export const allResources: MCPServerResources = {
  listResources: async () => resourceList,
  getResourceContent: async ({ uri }) => {
    const text = contentMap[uri];
    if (!text) {
      throw new Error(`Unknown resource URI: "${uri}"`);
    }
    return { text };
  },
};
