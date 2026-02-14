import { kibanaSearchTool } from './kibanaSearch';
import { listIndicesTool } from './listIndices';
import { getIndexMappingsTool } from './getIndexMappings';
import { discoverClusterTool } from './discoverCluster';

export const allTools = {
  discoverClusterTool,
  kibanaSearchTool,
  listIndicesTool,
  getIndexMappingsTool,
};
