/**
 * ToolHub - 工具注册与管理中心
 */

// Registry
export { DefaultToolRegistry, type ToolRegistryOptions } from './registry/ToolRegistry.js'
export { DefaultToolRegistry as ToolRegistry } from './registry/ToolRegistry.js'

// Executor
export { ToolExecutor, type ToolExecutorOptions } from './executor/ToolExecutor.js'

// Built-in tools
export { getFilesystemTools } from './builtin/filesystem.js'
export { getNetworkTools } from './builtin/network.js'
export { getAllBuiltinTools } from './builtin/index.js'

// Search
export { SearchEngine, type SearchEngineOptions } from './search/SearchEngine.js'

// Errors
export {
  TOOL_ERROR_CODES,
  toolNotFound,
  toolAlreadyRegistered,
  toolExecutionFailed,
  toolTimeout,
  toolHookRejected,
} from './errors.js'

// Re-export core types
export type {
  Tool,
  ToolContext,
  ToolResult,
  ToolFilter,
  ToolSearchQuery,
  ToolSearchResult,
  ToolCapabilities,
  ToolLifecycleHooks,
} from '@openclaw/suite-core'
