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

  // Agent 错误 (E51xx)
  E5101: 'AGENT_NOT_FOUND',
  E5102: 'AGENT_UNAVAILABLE',
  E5103: 'AGENT_TIMEOUT',
  E5104: 'COORDINATION_FAILED',

  // 消息错误 (E52xx)
  E5201: 'MESSAGE_DELIVERY_FAILED',
  E5202: 'MESSAGE_TIMEOUT',
} as const

export type CoordinatorErrorCode =
  (typeof COORDINATOR_ERROR_CODES)[keyof typeof COORDINATOR_ERROR_CODES]

/**
 * 创建任务未找到错误
 */
export function taskNotFound(taskId: string): Error & { code: string; taskId: string } {
  const err = new Error(`Task not found: ${taskId}`)
  return Object.assign(err, { code: COORDINATOR_ERROR_CODES.E5001, taskId })
}

/**
 * 创建任务超时错误
 */
export function taskTimeout(
  taskId: string,
  timeoutMs: number
): Error & { code: string; taskId: string; timeoutMs: number } {
  const err = new Error(`Task timeout: ${taskId} (${timeoutMs}ms)`)
  return Object.assign(err, {
    code: COORDINATOR_ERROR_CODES.E5002,
    taskId,
    timeoutMs,
  })
}

/**
 * 创建 Agent 未找到错误
 */
export function agentNotFound(agentId: string): Error & { code: string; agentId: string } {
  const err = new Error(`Agent not found: ${agentId}`)
  return Object.assign(err, { code: COORDINATOR_ERROR_CODES.E5101, agentId })
}

/**
 * 创建 Agent 不可用错误
 */
export function agentUnavailable(agentId: string): Error & { code: string; agentId: string } {
  const err = new Error(`Agent unavailable: ${agentId}`)
  return Object.assign(err, { code: COORDINATOR_ERROR_CODES.E5102, agentId })
}

/**
 * 创建协调失败错误
 */
export function coordinationFailed(
  reason: string,
  cause?: unknown
): Error & { code: string; reason: string; cause?: unknown } {
  const err = new Error(`Coordination failed: ${reason}`)
  return Object.assign(err, {
    code: COORDINATOR_ERROR_CODES.E5104,
    reason,
    cause,
  })
}
