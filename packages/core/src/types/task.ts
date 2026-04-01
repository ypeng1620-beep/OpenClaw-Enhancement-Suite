/**
 * 任务相关类型
 */

// ============================================================================
// 任务状态
// ============================================================================

export type TaskStatus =
  | { state: 'pending' }
  | { state: 'running'; startedAt: number }
  | { state: 'completed'; result: unknown; completedAt: number }
  | { state: 'failed'; error: string; failedAt: number }
  | { state: 'cancelled'; cancelledAt: number }
  | { state: 'timeout'; timedOutAt: number }
  | { state: 'waiting_approval' }

// ============================================================================
// 任务类型
// ============================================================================

export type TaskType = 'general' | 'research' | 'analysis' | 'implement' | 'other'

// ============================================================================
// 任务
// ============================================================================

export interface Task {
  readonly id: string
  readonly type: TaskType
  readonly description: string
  readonly prompt?: string
  readonly tools?: string[]
  readonly timeout: number
  readonly parentTaskId?: string
  readonly status: TaskStatus
  readonly createdAt: number
  readonly updatedAt: number
  readonly retryCount?: number
  readonly maxRetries?: number
  readonly childTaskIds?: string[]
  readonly assignedAgent?: AgentId
}

export interface TaskSubmission {
  readonly type?: TaskType
  readonly description: string
  readonly prompt?: string
  readonly tools?: string[]
  readonly timeout?: number
  readonly parentTaskId?: string
}

// ============================================================================
// Agent ID
// ============================================================================

export interface AgentId {
  readonly type: 'user' | 'agent' | 'system'
  readonly id: string
}

// ============================================================================
// 任务过滤
// ============================================================================

export interface TaskFilter {
  readonly status?: TaskStatus['state']
  readonly assignedAgent?: AgentId
  readonly type?: TaskType
  readonly parentTaskId?: string
}

// ============================================================================
// 消息
// ============================================================================

export interface AgentMessage {
  readonly id: string
  readonly type: 'request' | 'response' | 'notification'
  readonly from: AgentId
  readonly to: AgentId
  readonly content: unknown
  readonly timestamp: number
  readonly sessionId?: string
}

export interface TaskMessage {
  readonly taskId: string
  readonly type: 'assigned' | 'progress' | 'completed' | 'failed'
  readonly content: unknown
  readonly timestamp: number
}

// ============================================================================
// 任务处理器
// ============================================================================

export type TaskHandler = (
  task: Task,
  context: { signal?: AbortSignal }
) => Promise<unknown>

// ============================================================================
// 取消订阅
// ============================================================================

export type Unsubscribe = () => void
