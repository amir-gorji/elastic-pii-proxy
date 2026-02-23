import { elasticSearchTool } from './elasticSearch';
import { discoverClusterTool } from './discoverCluster';
import { checkClusterHealthTool } from './checkClusterHealth';
import { getAlertStatusTool } from './getAlertStatus';

export const allTools = {
  discoverClusterTool,
  elasticSearchTool,
  checkClusterHealthTool,
  getAlertStatusTool,
};
