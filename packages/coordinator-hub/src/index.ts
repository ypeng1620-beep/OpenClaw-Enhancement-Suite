/**
 * Coordinator Hub - 多 Agent 协调中心
 */

// Task Manager
export {
  TaskManager,
  type TaskManagerOptions,
  type TaskStore,
  type TaskEvent,
  type TaskEventListener,
  type RetryOptions,
  type RetryState,
  type ParentCompletionStrategy,
} from './task/TaskManager.js'

// Permission Ask Handler
export {
  PermissionAskHandler,
  createPermissionAskHandler,
  formatConfirmationMessage,
  type ConfirmationRequest,
  type ConfirmationStatus,
  type PermissionAskHandlerOptions,
} from './ask/PermissionAskHandler.js'

// Re-export core types
export type {
  Task,
  TaskSubmission,
  TaskFilter,
  TaskType,
  TaskStatus,
  AgentId,
  AgentMessage,
  TaskMessage,
  TaskHandler,
  Unsubscribe,
} from '@openclaw/suite-core'

// Errors
export {
  CoordinatorError,
  COORDINATOR_ERROR_CODES,
  taskNotFound,
  taskTimeout,
  taskConcurrentLimit,
  agentNotFound,
  agentUnavailable,
  coordinationFailed,
  parentTaskFailed,
} from './errors.js'
