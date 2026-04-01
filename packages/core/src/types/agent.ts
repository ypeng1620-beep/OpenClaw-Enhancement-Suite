/**
 * Agent 协调相关类型定义
 * 对应 api-standards.md 五
 */

// ============================================================================
// Agent 标识
// ============================================================================

/** Agent 标识 */
export interface AgentId {
  readonly type: 'user' | 'agent' | 'system'
  readonly id: string
}

/** 创建 Agent ID */
export function createAgentId(
  type: AgentId['type'],
  id: string
): AgentId {
  return { type, id }
}

/** 系统 Agent ID */
export const SYSTEM_AGENT: AgentId = { type: 'system', id: 'system' }

/** 用户 Agent ID */
export function createUserAgentId(userId: string): AgentId {
  return { type: 'user', id: userId }
}

/** 创建子 Agent ID */
export function createSubAgentId(agentId: string): AgentId {
  return { type: 'agent', id: agentId }
}

// ============================================================================
// Agent 消息
// ============================================================================

/** Agent 消息类型 */
export type AgentMessageType =
  | 'task:submit'
  | 'task:result'
  | 'task:progress'
  | 'task:cancel'
  | 'task:heartbeat'
  | 'task:stop'
  | 'message:send'
  | 'message:reply'

/** Agent 消息 */
export interface AgentMessage {
  readonly id: string
  readonly type: AgentMessageType
  readonly from: AgentId
  readonly to: AgentId | '*'
  readonly timestamp: number
  readonly payload: unknown
}

/** 任务消息 */
export interface TaskMessage extends AgentMessage {
  readonly type: 'task:submit' | 'task:result' | 'task:progress'
  readonly payload: TaskPayload
}

/** 任务负载 */
export interface TaskPayload {
  readonly taskId: string
  readonly description: string
  readonly prompt: string
  readonly tools?: string[]
  readonly timeout?: number
  readonly priority?: number
}

// ============================================================================
// 任务状态
// ============================================================================

/** 任务类型 */
export type TaskType = 'research' | 'implement' | 'verify' | 'general' | 'analysis' | 'other'

/** 任务状态 */
export type TaskStatus =
  | { state: 'pending' }
  | { state: 'running'; startedAt: number }
  | {
      state: 'completed'
      result: unknown
      completedAt: number
    }
  | { state: 'failed'; error: string; failedAt: number }
  | { state: 'cancelled'; cancelledAt: number }
  | { state: 'timeout'; timedOutAt: number }
  | { state: 'waiting_approval' }

/** 获取任务状态的显示名称 */
export function getTaskStatusName(status: TaskStatus): string {
  switch (status.state) {
    case 'pending':
      return '等待中'
    case 'running':
      return '运行中'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    case 'timeout':
      return '超时'
    case 'waiting_approval':
      return '等待确认'
  }
}

/** 任务 */
export interface Task {
  readonly id: string
  readonly type: TaskType
  readonly description: string
  readonly prompt?: string
  readonly tools?: string[]
  readonly timeout?: number
  readonly retryCount?: number
  readonly maxRetries?: number
  readonly assignedAgent?: AgentId
  readonly status: TaskStatus
  readonly parentTaskId?: string
  readonly childTaskIds?: string[]
  readonly createdAt: number
  readonly updatedAt: number
}

/** 创建任务 */
export function createTask(
  id: string,
  description: string,
  options?: { prompt?: string; type?: TaskType }
): Task {
  const now = Date.now()
  return {
    id,
    type: options?.type || 'general',
    description,
    prompt: options?.prompt,
    status: { state: 'pending' },
    createdAt: now,
    updatedAt: now,
  }
}

/** 任务提交 */
export interface TaskSubmission {
  readonly description: string
  readonly prompt?: string
  readonly type?: TaskType
  readonly tools?: string[]
  readonly timeout?: number
  readonly parentTaskId?: string
}

/** 任务过滤器 */
export interface TaskFilter {
  readonly status?: TaskStatus['state']
  readonly assignedAgent?: AgentId
  readonly type?: TaskType
  readonly parentTaskId?: string
}

// ============================================================================
// 任务事件
// ============================================================================

/** 任务事件类型 */
export type TaskEventType = 'status_change' | 'progress' | 'message'

/** 任务事件 */
export type TaskEvent =
  | { type: 'status_change'; taskId: string; status: TaskStatus }
  | {
      type: 'progress'
      taskId: string
      progress: number
      message?: string
    }
  | { type: 'message'; taskId: string; from: AgentId; content: unknown }

/** 任务处理器 */
export type TaskHandler = (event: TaskEvent) => void

/** 取消订阅函数 */
export type Unsubscribe = () => void

// ============================================================================
// 协调器接口
// ============================================================================

/** 协调器接口 */
export interface Coordinator {
  submitTask(task: TaskSubmission): Promise<Task>
  getTask(taskId: string): Promise<Task | undefined>
  listTasks(filter?: TaskFilter): Promise<Task[]>
  cancelTask(taskId: string): Promise<void>
  sendMessage(to: AgentId, message: unknown): Promise<void>
  subscribe(taskId: string, handler: TaskHandler): Unsubscribe
}

// ============================================================================
// 任务持久化存储（可选实现）
// ============================================================================

/** 任务存储接口 - 支持长时间运行和跨进程访问
 *
 * 注意：任务状态默认存储在内存中。
 * 如果 Agent 需要长时间运行（例如等待人工审批），
 * 或需要跨进程/跨机器访问，请接入 TaskStore 实现。
 */
export interface TaskStore {
  /** 保存任务 */
  save(task: Task): Promise<void>

  /** 获取任务 */
  get(taskId: string): Promise<Task | undefined>

  /** 查询任务列表 */
  query(filter?: TaskFilter): Promise<Task[]>

  /** 更新任务状态 */
  updateStatus(taskId: string, status: TaskStatus): Promise<void>

  /** 删除任务 */
  delete(taskId: string): Promise<void>

  /** 监听变化（用于多实例同步） */
  watch(handler: (task: Task) => void): () => void
}

/** 内存任务存储（默认实现） */
export class InMemoryTaskStore implements TaskStore {
  private tasks: Map<string, Task> = new Map()
  private watchers: Set<(task: Task) => void> = new Set()

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, task)
    this.notifyWatchers(task)
  }

  async get(taskId: string): Promise<Task | undefined> {
    return this.tasks.get(taskId)
  }

  async query(filter?: TaskFilter): Promise<Task[]> {
    let tasks = Array.from(this.tasks.values())

    if (filter) {
      if (filter.status) {
        tasks = tasks.filter((t) => t.status.state === filter.status)
      }
      if (filter.assignedAgent) {
        tasks = tasks.filter(
          (t) =>
            t.assignedAgent?.id === filter.assignedAgent?.id
        )
      }
      if (filter.type) {
        tasks = tasks.filter((t) => t.type === filter.type)
      }
      if (filter.parentTaskId) {
        tasks = tasks.filter(
          (t) => t.parentTaskId === filter.parentTaskId
        )
      }
    }

    return tasks.sort((a, b) => b.createdAt - a.createdAt)
  }

  async updateStatus(taskId: string, status: TaskStatus): Promise<void> {
    const task = this.tasks.get(taskId)
    if (task) {
      const updated = { ...task, status, updatedAt: Date.now() }
      this.tasks.set(taskId, updated)
      this.notifyWatchers(updated)
    }
  }

  async delete(taskId: string): Promise<void> {
    this.tasks.delete(taskId)
  }

  watch(handler: (task: Task) => void): () => void {
    this.watchers.add(handler)
    return () => this.watchers.delete(handler)
  }

  private notifyWatchers(task: Task): void {
    this.watchers.forEach((cb) => cb(task))
  }
}
