/**
 * OpenClaw Enhancement Suite - 集成层
 *
 * 重新导出所有 suite 包，提供统一入口
 *
 * 安装后使用：
 * ```typescript
 * import {
 *   // ToolHub
 *   DefaultToolRegistry,
 *   ToolExecutor,
 *   // PermissionHub
 *   RuleEngine,
 *   PermissionChecker,
 *   PermissionGuard,
 *   MemoryRuleStore,
 *   FileRuleStore,
 *   // ContextHub
 *   ContextManager,
 *   DiminishingReturnsDetector,
 *   // MCP Hub
 *   MCPServerRegistry,
 *   MCPToolMapper,
 *   // CoordinatorHub
 *   TaskManager,
 * } from '@openclaw/suite-integration'
 * ```
 */

// Re-export all from suite packages
export {
  DefaultToolRegistry,
  ToolExecutor,
  type ToolRegistryOptions,
  type ToolExecutorOptions,
} from '@openclaw/suite-tool-hub'

export {
  RuleEngine,
  PermissionChecker,
  PermissionGuard,
  MemoryRuleStore,
  FileRuleStore,
  RemoteRuleStore,
  createRuleStore,
  type RuleEngineConfig,
  type PermissionCheckerOptions,
  type PermissionGuardOptions,
  type RuleStoreOptions,
} from '@openclaw/suite-permission-hub'

export {
  ContextManager,
  DiminishingReturnsDetector,
  createCompactStrategy,
  MicroCompactStrategy,
  AutoCompactStrategy,
  ManualCompactStrategy,
  type ContextManagerOptions,
  type DetectorOptions,
  type CompactStrategy,
  type ToolContextAdapterOptions,
} from '@openclaw/suite-context-hub'

export {
  MCPServerRegistry,
  MCPToolMapper,
  type MCPServerRegistryOptions,
  type MapperOptions,
  type MappingResult,
} from '@openclaw/suite-mcp-hub'

export {
  TaskManager,
  PermissionAskHandler,
  createPermissionAskHandler,
  formatConfirmationMessage,
  type TaskManagerOptions,
  type TaskStore,
  type TaskEvent,
  type TaskEventListener,
  type RetryOptions,
  type ParentCompletionStrategy,
  type ConfirmationRequest,
  type PermissionAskHandlerOptions,
} from '@openclaw/suite-coordinator-hub'

// Re-export core types
export type {
  Tool,
  ToolContext,
  ToolResult,
  ToolFilter,
  ToolSearchQuery,
  ToolSearchResult,
  ToolCapabilities,
  MCPServerConfig,
  MCPServer,
  MCPTool,
  PermissionRule,
  PermissionRequest,
  PermissionDecision,
  AgentId,
  Task,
  TaskSubmission,
  TaskFilter,
  TaskStatus,
  ContextEvent,
  ContextSnapshot,
  CompactResult,
  ContextStats,
} from '@openclaw/suite-core'
