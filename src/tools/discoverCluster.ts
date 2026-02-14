import { z } from 'zod';
import { createSecureTool } from '../lib/toolWrapper';
import { validateIndexName } from '../lib/inputSanitizer';
import { flattenProperties, FieldMapping } from '../lib/mappingUtils';

export interface DiscoveredIndex {
  index: string;
  health: string;
  status: string;
  doc_count: string;
  store_size: string;
  fields: FieldMapping[];
}

export interface ClusterDiscovery {
  cluster_summary: { total_indices: number; discovered: number };
  indices: DiscoveredIndex[];
}

export const discoverClusterTool = createSecureTool({
  id: 'discover_cluster',
  description:
    'Discover the Elasticsearch cluster: lists all available indices and their field mappings. Call this tool FIRST before any search to understand what data is available, what indices exist, and what fields each index contains.',
  inputSchema: z.object({
    pattern: z
      .string()
      .optional()
      .default('*')
      .describe('Index pattern to filter (e.g., "logs-*"). Defaults to "*".'),
    include_hidden: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include system/hidden indices (those starting with "."). Defaults to false.'),
    max_indices: z
      .number()
      .optional()
      .default(50)
      .describe('Maximum number of indices to fetch mappings for. Defaults to 50.'),
  }),
  execute: async ({ pattern, include_hidden, max_indices }, { config, esClient }) => {
    validateIndexName(pattern ?? '*');

    // 1. List all indices
    const rawIndices = await esClient.catIndices(pattern);

    // 2. Build index info list
    let indices = rawIndices.map((idx: any) => ({
      index: idx.index as string,
      health: idx.health as string,
      status: idx.status as string,
      doc_count: idx['docs.count'] as string,
      store_size: idx['store.size'] as string,
    }));

    // 3. Filter hidden indices
    if (!include_hidden) {
      indices = indices.filter((idx) => !idx.index.startsWith('.'));
    }

    // 4. Filter against allowed patterns if configured
    if (config.allowedIndexPatterns.length > 0) {
      indices = indices.filter((idx) =>
        config.allowedIndexPatterns.some((p) => globMatch(p, idx.index)),
      );
    }

    const totalIndices = indices.length;

    // 5. Sort by doc count descending (biggest first) and cap
    indices.sort((a, b) => {
      const countA = parseInt(a.doc_count, 10) || 0;
      const countB = parseInt(b.doc_count, 10) || 0;
      return countB - countA;
    });
    indices = indices.slice(0, max_indices);

    // 6. Fetch mappings in parallel
    const discoveredIndices: DiscoveredIndex[] = await Promise.all(
      indices.map(async (idx) => {
        const fields: FieldMapping[] = [];
        try {
          const mappingData = await esClient.getMapping(idx.index);
          for (const indexName of Object.keys(mappingData)) {
            const properties = mappingData[indexName]?.mappings?.properties;
            if (properties) {
              flattenProperties(properties, '', fields);
            }
          }
        } catch {
          // If mapping fetch fails for an index, return it with empty fields
        }

        // Deduplicate fields (same field path can appear from multiple concrete indices)
        const seen = new Map<string, string>();
        for (const f of fields) {
          if (!seen.has(f.field)) {
            seen.set(f.field, f.type);
          }
        }

        return {
          ...idx,
          fields: Array.from(seen.entries()).map(([field, type]) => ({ field, type })),
        };
      }),
    );

    return {
      status: 'success' as const,
      data: {
        cluster_summary: {
          total_indices: totalIndices,
          discovered: discoveredIndices.length,
        },
        indices: discoveredIndices,
      } satisfies ClusterDiscovery,
    };
  },
});

function globMatch(pattern: string, value: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${regexStr}$`).test(value);
}
