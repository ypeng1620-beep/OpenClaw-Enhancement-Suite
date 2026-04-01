/**
 * CoordinatorHub 错误码
 *
 * E5xxx 系列 - 协调器相关错误
 */

export const COORDINATOR_ERROR_CODES = {
  // 任务错误 (E50xx)
  E5001: 'TASK_NOT_FOUND',
  E5002: 'TASK_TIMEOUT',
  E5003: 'TASK_ALREADY_EXISTS',
  E5004: 'TASK_CANCELLED',
  E5005: 'TASK_MAX_RETRIES',
  E5006: 'TASK_CONCURRENT_LIMIT',

  // Agent 错误 (E51xx)
  E5101: 'AGENT_NOT_FOUND',
  E5102: 'AGENT_UNAVAILABLE',
  E5103: 'AGENT_TIMEOUT',
  E5104: 'COORDINATION_FAILED',

  // 消息错误 (E52xx)
  E5201: 'MESSAGE_DELIVERY_FAILED',
  E5202: 'MESSAGE_TIMEOUT',

  // 任务策略错误 (E53xx)
  E5301: 'INVALID_COMPLETION_STRATEGY',
  E5302: 'PARENT_TASK_FAILED',
} as const

export type CoordinatorErrorCode =
  (typeof COORDINATOR_ERROR_CODES)[keyof typeof COORDINATOR_ERROR_CODES]

/**
 * CoordinatorError - 标准错误类型
 */
export class CoordinatorError extends Error {
  readonly code: CoordinatorErrorCode
  readonly taskId?: string
  readonly agentId?: string
  readonly cause?: unknown

  constructor(code: CoordinatorErrorCode, message: string, options?: {
    taskId?: string
    agentId?: string
    cause?: unknown
  }) {
    super(message)
    this.name = 'CoordinatorError'
    this.code = code
    this.taskId = options?.taskId
    this.agentId = options?.agentId
    this.cause = options?.cause
  }
}

/**
 * 创建任务未找到错误
 */
export function taskNotFound(taskId: string): CoordinatorError {
  return new CoordinatorError(
    COORDINATOR_ERROR_CODES.E5001,
    `Task not found: ${taskId}`,
    { taskId }
  )
}

/**
 * 创建任务超时错误
 */
export function taskTimeout(taskId: string, timeoutMs: number): CoordinatorError {
  return new CoordinatorError(
    COORDINATOR_ERROR_CODES.E5002,
    `Task timeout: ${taskId} (${timeoutMs}ms)`,
    { taskId }
  )
}

/**
 * 创建并发超限错误
 */
export function taskConcurrentLimit(max: number): CoordinatorError {
  return new CoordinatorError(
    COORDINATOR_ERROR_CODES.E5006,
    `Max concurrent tasks (${max}) reached`
  )
}

/**
 * 创建 Agent 未找到错误
 */
export function agentNotFound(agentId: string): CoordinatorError {
  return new CoordinatorError(
    COORDINATOR_ERROR_CODES.E5101,
    `Agent not found: ${agentId}`,
    { agentId }
  )
}

/**
 * 创建 Agent 不可用错误
 */
export function agentUnavailable(agentId: string): CoordinatorError {
  return new CoordinatorError(
    COORDINATOR_ERROR_CODES.E5102,
    `Agent unavailable: ${agentId}`,
    { agentId }
  )
}

/**
 * 创建协调失败错误
 */
export function coordinationFailed(
  reason: string,
  cause?: unknown
): CoordinatorError {
  return new CoordinatorError(
    COORDINATOR_ERROR_CODES.E5104,
    `Coordination failed: ${reason}`,
    { cause }
  )
}

/**
 * 创建父任务失败错误（子任务失败传播）
 */
export function parentTaskFailed(
  parentTaskId: string,
  childTaskId: string,
  error: string
): CoordinatorError {
  return new CoordinatorError(
    COORDINATOR_ERROR_CODES.E5302,
    `Parent task failed due to child task failure: ${parentTaskId}`,
    { taskId: parentTaskId, cause: { childTaskId, error } }
  )
}
