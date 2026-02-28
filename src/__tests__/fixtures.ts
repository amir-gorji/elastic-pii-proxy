/**
 * Shared test fixture factories for elastic-pii-proxy tests.
 *
 * Import from here instead of re-defining in each test file so that a single
 * change propagates to all tests when the underlying types change.
 */
import type {
  CallToolRequest,
  CallToolResult,
  ReadResourceRequest,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { ProxyConfig } from '../lib/config.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function makeConfig(overrides: Partial<ProxyConfig> = {}): ProxyConfig {
  return {
    command: 'node',
    args: [],
    url: undefined,
    complianceProfile: 'GDPR',
    auditEnabled: true,
    awsRegion: 'us-east-1',
    comprehendEnabled: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tool call fixtures
// ---------------------------------------------------------------------------

export function makeToolReq(name = 'test_tool'): CallToolRequest {
  return {
    method: 'tools/call',
    params: { name, arguments: {} },
  };
}

export function makeToolResult(text = 'mock response'): CallToolResult {
  return {
    content: [{ type: 'text', text }],
  };
}

export function makeErrorToolResult(
  text = 'something went wrong',
): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Resource read fixtures
// ---------------------------------------------------------------------------

export function makeResourceReq(uri = 'file://test.txt'): ReadResourceRequest {
  return {
    method: 'resources/read',
    params: { uri },
  };
}

export function makeResourceResult(
  text = 'mock resource content',
): ReadResourceResult {
  return {
    contents: [{ uri: 'file://test.txt', text, mimeType: 'text/plain' }],
  };
}
