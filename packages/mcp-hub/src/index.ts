/**
 * MCP Hub - MCP 服务器集成中心
 */

// Server Management
export { MCPConnectionManager, type MCPConnectionManagerOptions } from './server/MCPConnectionManager.js'
export { MCPServerRegistry, type MCPServerRegistryOptions } from './server/MCPServerRegistry.js'

// Tool Mapper
export { MCPToolMapper, createMCPToolMapper, type MapperOptions, type MappingResult } from './mapper/MCPToolMapper.js'

// Re-export core types
export type {
  MCPServerConfig,
  MCPServerType,
  MCPServer,
  MCPServerStatus,
  MCPTool,
  HealthStatus,
} from '@openclaw/suite-core'

// Errors
export {
  MCP_ERROR_CODES,
  mcpServerNotFound,
  mcpConnectionFailed,
  mcpServerAlreadyExists,
  mcpToolNotFound,
  mcpToolCallFailed,
  mcpToolTimeout,
  mcpMapperFailed,
} from './errors.js'
