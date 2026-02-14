import { z } from 'zod';
import { createSecureTool } from '../lib/toolWrapper';
import { validateIndexName } from '../lib/inputSanitizer';
import { flattenProperties, FieldMapping } from '../lib/mappingUtils';

export const getIndexMappingsTool = createSecureTool({
  id: 'get_index_mappings',
  description:
    'Get the field mappings for an Elasticsearch index. Returns a flat list of field names and their types, which is useful for understanding the structure of an index before querying it.',
  inputSchema: z.object({
    index: z.string().describe('The index name to get mappings for (e.g., "transactions")'),
  }),
  execute: async ({ index }, { esClient }) => {
    validateIndexName(index);

    const mappingData = await esClient.getMapping(index);

    // ES returns { "index_name": { "mappings": { "properties": { ... } } } }
    // May return multiple indices if a pattern is used
    const fields: FieldMapping[] = [];

    for (const indexName of Object.keys(mappingData)) {
      const properties = mappingData[indexName]?.mappings?.properties;
      if (properties) {
        flattenProperties(properties, '', fields);
      }
    }

    return {
      status: 'success' as const,
      data: { index, fields },
    };
  },
});

