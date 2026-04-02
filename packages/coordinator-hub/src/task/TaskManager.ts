/**
 * 任务管理器
 *
 * 负责任务的创建、状态跟踪、生命周期管理
 *
 * 特性：
 * - 任务重试机制
 * - 父子任务完成策略（all_success / any_success / manual）
 * - 超时自动清理（向下传播取消子任务）
 * - 事件系统（subscribe / once / destroy）
 * - 可替换存储（TaskStore 接口）
 */

import type {
  Task,
  TaskSubmission,
  TaskFilter,
  TaskType,
  TaskStatus,
} from '@openclaw/suite-core'
import {
  taskNotFound,
  taskTimeout,
  taskConcurrentLimit,
  parentTaskFailed,
  CoordinatorError,
} from '../errors.js'

// 日志开关
const DEBUG = process.env.DEBUG === 'true'
const log = (...args: unknown[]) => DEBUG && console.log('[TaskManager]', ...args)

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 任务管理器配置
 */
export interface TaskManagerOptions {
  /** 默认超时（毫秒） */
  defaultTimeout?: number

  /** 最大并发任务数 */
  maxConcurrentTasks?: number

  /** 任务存储（可选，默认内存） */
  store?: TaskStore

  /** 父子任务完成策略 */
  parentCompletionStrategy?: ParentCompletionStrategy

  /** 默认重试次数 */
  defaultMaxRetries?: number

  /** 默认重试延迟（毫秒） */
  defaultRetryDelay?: number
}

/**
 * 父子任务完成策略
 */
export type ParentCompletionStrategy =
  /** 所有子任务成功，父任务才成功；任一失败，父任务失败 */
  | 'all_success'
  /** 任一子任务成功即成功；全部失败，父任务失败 */
  | 'any_success'
  /** 手动决定，由调用方显式调用 completeParent */
  | 'manual'

/**
 * 任务存储接口
 */
export interface TaskStore {
  save(task: Task): Promise<void>
  get(taskId: string): Promise<Task | undefined>
  query(filter?: TaskFilter): Promise<Task[]>
  updateStatus(taskId: string, status: TaskStatus): Promise<void>
  updateField<K extends keyof Task>(taskId: string, field: K, value: Task[K]): Promise<void>
  delete(taskId: string): Promise<void>
}

/**
 * 任务监听器
 */
export type TaskEventListener = (event: TaskEvent) => void

/**
 * 任务事件
 */
export type TaskEvent =
  | { type: 'created'; task: Task }
  | { type: 'started'; taskId: string }
  | { type: 'progress'; taskId: string; progress: number; message?: string }
  | { type: 'completed'; taskId: string; result: unknown }
  | { type: 'failed'; taskId: string; error: string }
  | { type: 'cancelled'; taskId: string }
  | { type: 'timeout'; taskId: string }
  | { type: 'deleted'; taskId: string }
  | { type: 'retry_scheduled'; taskId: string; attempt: number; delayMs: number }
  | { type: 'retry_executed'; taskId: string; attempt: number }
  | { type: 'waiting_approval'; taskId: string }
  | { type: 'approval_resolved'; taskId: string; approved: boolean }

/**
 * 重试选项
 */
export interface RetryOptions {
  maxRetries?: number
  retryDelay?: number
  backoff?: 'linear' | 'exponential'
  maxDelay?: number
}

/**
 * 任务重试状态
 */
export interface RetryState {
  attempt: number
  maxRetries: number
  retryDelay: number
  scheduledAt?: number
}

// ============================================================================
// 内存存储实现
// ============================================================================

/**
 * 内存任务存储
 */
class MemoryTaskStore implements TaskStore {
  private tasks = new Map<string, Task>()

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, task)
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
        tasks = tasks.filter((t) => t.assignedAgent?.id === filter.assignedAgent?.id)
      }
      if (filter.type) {
        tasks = tasks.filter((t) => t.type === filter.type)
      }
      if (filter.parentTaskId) {
        tasks = tasks.filter((t) => t.parentTaskId === filter.parentTaskId)
      }
    }

    return tasks.sort((a, b) => b.createdAt - a.createdAt)
  }

  async updateStatus(taskId: string, status: TaskStatus): Promise<void> {
    const task = this.tasks.get(taskId)
    if (task) {
      this.tasks.set(taskId, { ...task, status, updatedAt: Date.now() })
    }
  }

  async updateField<K extends keyof Task>(taskId: string, field: K, value: Task[K]): Promise<void> {
    const task = this.tasks.get(taskId)
    if (task) {
      this.tasks.set(taskId, { ...task, [field]: value, updatedAt: Date.now() })
    }
  }

  async delete(taskId: string): Promise<void> {
    this.tasks.delete(taskId)
  }
}

// ============================================================================
// 任务管理器
// ============================================================================

/**
 * 任务管理器
 */
export class TaskManager {
  private readonly store: TaskStore
  private readonly defaultTimeout: number
  private readonly maxConcurrentTasks: number
  private readonly parentCompletionStrategy: ParentCompletionStrategy
  private readonly defaultMaxRetries: number
  private readonly defaultRetryDelay: number
  private readonly listeners = new Map<string, Set<TaskEventListener>>()
  private readonly activeTimeouts = new Map<string, NodeJS.Timeout>()
  private readonly retrySchedules = new Map<string, NodeJS.Timeout>()
  private readonly retryState = new Map<string, RetryState>()
  private readonly pendingApprovals = new Map<string, {
    resolve: (approved: boolean) => void
    reject: (error: Error) => void
  }>()
  private destroyed = false

  constructor(options: TaskManagerOptions = {}) {
    this.store = options.store || new MemoryTaskStore()
    this.defaultTimeout = options.defaultTimeout || 300000 // 5 分钟
    this.maxConcurrentTasks = options.maxConcurrentTasks || 10
    this.parentCompletionStrategy = options.parentCompletionStrategy || 'all_success'
    this.defaultMaxRetries = options.defaultMaxRetries ?? 3
    this.defaultRetryDelay = options.defaultRetryDelay ?? 5000
  }

  // =========================================================================
  // 生命周期
  // =========================================================================

  /**
   * 销毁管理器，清理所有资源
   */
  destroy(): void {
    log('Destroying TaskManager')
    this.destroyed = true

    // 清理所有超时
    for (const [taskId, handle] of this.activeTimeouts) {
      clearTimeout(handle)
      log(`  Cleared timeout for ${taskId}`)
    }
    this.activeTimeouts.clear()

    // 清理所有重试计划
    for (const [taskId, handle] of this.retrySchedules) {
      clearTimeout(handle)
      log(`  Cleared retry for ${taskId}`)
    }
    this.retrySchedules.clear()

    // 清理所有监听器
    this.listeners.clear()

    // 拒绝所有待批准的请求
    for (const [taskId, { reject }] of this.pendingApprovals) {
      reject(new Error('TaskManager destroyed'))
      log(`  Rejected pending approval for ${taskId}`)
    }
    this.pendingApprovals.clear()
  }

  // =========================================================================
  // 任务创建
  // =========================================================================

  /**
   * 创建任务
   */
  async createTask(submission: TaskSubmission, retryOpts?: RetryOptions): Promise<Task> {
    this.ensureNotDestroyed()

    const activeCount = await this.getActiveTaskCount()
    if (activeCount >= this.maxConcurrentTasks) {
      throw taskConcurrentLimit(this.maxConcurrentTasks)
    }

    const now = Date.now()
    const task: Task = {
      id: `task-${now}-${Math.random().toString(36).slice(2, 8)}`,
      type: submission.type || 'general',
      description: submission.description,
      prompt: submission.prompt,
      tools: submission.tools,
      timeout: submission.timeout || this.defaultTimeout,
      parentTaskId: submission.parentTaskId,
      status: { state: 'pending' },
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: retryOpts?.maxRetries ?? this.defaultMaxRetries,
      childTaskIds: [],
    }

    // 如果有父任务，登记子任务 ID
    if (task.parentTaskId) {
      const parent = await this.store.get(task.parentTaskId)
      if (parent) {
        await this.store.updateField(task.parentTaskId, 'childTaskIds', [
          ...(parent.childTaskIds || []),
          task.id,
        ])
      }
    }

    await this.store.save(task)
    log(`Created task ${task.id} (type=${task.type})`)
    this.emit({ type: 'created', task })

    return task
  }

  /**
   * 批量创建子任务
   */
  async createSubtasks(
    parentTaskId: string,
    submissions: TaskSubmission[],
    retryOpts?: RetryOptions
  ): Promise<Task[]> {
    const parent = await this.store.get(parentTaskId)
    if (!parent) throw taskNotFound(parentTaskId)

    const subtasks = await Promise.all(
      submissions.map((sub) =>
        this.createTask(
          {
            ...sub,
            parentTaskId,
            type: sub.type || parent.type,
          },
          retryOpts
        )
      )
    )

    // 更新父任务的子任务列表
    await this.store.updateField(parentTaskId, 'childTaskIds', subtasks.map((t) => t.id))

    return subtasks
  }

  // =========================================================================
  // 任务查询
  // =========================================================================

  async getTask(taskId: string): Promise<Task | undefined> {
    return this.store.get(taskId)
  }

  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    return this.store.query(filter)
  }

  async getActiveTaskCount(): Promise<number> {
    const tasks = await this.store.query()
    return tasks.filter((t) => t.status.state === 'running').length
  }

  // =========================================================================
  // 任务状态
  // =========================================================================

  /**
   * 开始任务
   */
  async startTask(taskId: string): Promise<void> {
    this.ensureNotDestroyed()
    const task = await this.store.get(taskId)
    if (!task) throw taskNotFound(taskId)

    if (task.status.state !== 'pending') {
      throw new Error(`Task ${taskId} is not pending (current: ${task.status.state})`)
    }

    await this.updateStatus(taskId, {
      state: 'running',
      startedAt: Date.now(),
    })

    log(`Started task ${taskId}`)
    this.emit({ type: 'started', taskId })

    // 设置超时
    this.setTaskTimeout(taskId, task.timeout || this.defaultTimeout)
  }

  /**
   * 更新进度
   */
  async updateProgress(
    taskId: string,
    progress: number,
    message?: string
  ): Promise<void> {
    if (!(await this.store.get(taskId))) throw taskNotFound(taskId)
    this.emit({ type: 'progress', taskId, progress, message })
  }

  /**
   * 完成任务
   */
  async completeTask(taskId: string, result: unknown): Promise<void> {
    this.clearTaskTimeout(taskId)
    this.clearRetry(taskId)

    const task = await this.store.get(taskId)
    if (!task) throw taskNotFound(taskId)

    await this.updateStatus(taskId, {
      state: 'completed',
      result,
      completedAt: Date.now(),
    })

    log(`Completed task ${taskId}`)
    this.emit({ type: 'completed', taskId, result })

    // 向上传播：检查父任务
    if (task.parentTaskId) {
      await this.checkParentCompletion(task.parentTaskId)
    }
  }

  /**
   * 标记任务失败
   * @param taskId 任务 ID
   * @param error 错误信息
   * @param strategy 可选：强制失败策略，覆盖默认策略
   */
  async failTask(
    taskId: string,
    error: string,
    strategy?: 'fail_parent' | 'ignore_parent'
  ): Promise<void> {
    this.clearTaskTimeout(taskId)
    this.clearRetry(taskId)

    const task = await this.store.get(taskId)
    if (!task) throw taskNotFound(taskId)

    await this.updateStatus(taskId, {
      state: 'failed',
      error,
      failedAt: Date.now(),
    })

    log(`Failed task ${taskId}: ${error}`)
    this.emit({ type: 'failed', taskId, error })

    // 向下传播：取消所有子任务
    if (task.childTaskIds?.length) {
      await this.cancelChildren(taskId, task.childTaskIds)
    }

    // 向上传播：根据策略处理父任务
    if (task.parentTaskId) {
      const s = strategy ?? this.parentCompletionStrategy
      // 'all_success' 策略下，子任务失败也应导致父任务失败
      if (s === 'fail_parent' || s === 'all_success') {
        await this.handleChildFailure(task.parentTaskId, taskId, error)
      }
      // 'ignore_parent' 策略：不处理父任务
    }
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<void> {
    this.clearTaskTimeout(taskId)
    this.clearRetry(taskId)

    const task = await this.store.get(taskId)
    if (!task) throw taskNotFound(taskId)

    if (task.status.state === 'completed' || task.status.state === 'cancelled') {
      return
    }

    await this.updateStatus(taskId, {
      state: 'cancelled',
      cancelledAt: Date.now(),
    })

    log(`Cancelled task ${taskId}`)
    this.emit({ type: 'cancelled', taskId })

    // 向下传播：取消子任务
    if (task.childTaskIds?.length) {
      await this.cancelChildren(taskId, task.childTaskIds)
    }

    // 向上传播
    if (task.parentTaskId) {
      await this.checkParentCompletion(task.parentTaskId)
    }
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<void> {
    this.clearTaskTimeout(taskId)
    this.clearRetry(taskId)
    await this.store.delete(taskId)
    log(`Deleted task ${taskId}`)
    this.emit({ type: 'deleted', taskId })
  }

  // =========================================================================
  // 任务重试
  // =========================================================================

  /**
   * 调度任务重试
   *
   * @param taskId 任务 ID
   * @param options 重试选项
   */
  async scheduleRetry(taskId: string, options?: RetryOptions): Promise<void> {
    const task = await this.store.get(taskId)
    if (!task) throw taskNotFound(taskId)

    const maxRetries = options?.maxRetries ?? task.maxRetries ?? this.defaultMaxRetries
    const retryDelay = options?.retryDelay ?? this.defaultRetryDelay
    const attempt = (this.retryState.get(taskId)?.attempt ?? 0) + 1

    if (attempt > maxRetries) {
      log(`Task ${taskId} exceeded max retries (${maxRetries})`)
      await this.failTask(taskId, `Max retries (${maxRetries}) exceeded`)
      return
    }

    // 计算延迟（支持指数退避）
    let delayMs = retryDelay
    if (options?.backoff === 'exponential') {
      delayMs = Math.min(retryDelay * Math.pow(2, attempt - 1), options.maxDelay ?? 60000)
    }

    this.retryState.set(taskId, { attempt, maxRetries, retryDelay, scheduledAt: Date.now() + delayMs })

    log(`Scheduled retry for ${taskId} (attempt ${attempt}/${maxRetries}, delay ${delayMs}ms)`)
    this.emit({ type: 'retry_scheduled', taskId, attempt, delayMs })

    // 清除旧的重试计划
    this.clearRetry(taskId)

    const handle = setTimeout(async () => {
      if (this.destroyed) return

      this.emit({ type: 'retry_executed', taskId, attempt })

      // 重置状态为 pending 并重新启动
      await this.updateStatus(taskId, { state: 'pending' })
      await this.startTask(taskId)
    }, delayMs)

    this.retrySchedules.set(taskId, handle)
  }

  /**
   * 手动重试任务（立即执行）
   */
  async retryTask(taskId: string): Promise<void> {
    const task = await this.store.get(taskId)
    if (!task) throw taskNotFound(taskId)

    if (task.status.state !== 'failed' && task.status.state !== 'timeout') {
      throw new Error(`Task ${taskId} cannot be retried (state: ${task.status.state})`)
    }

    // 重置重试计数
    this.retryState.delete(taskId)

    // 增加 retryCount
    await this.store.updateField(taskId, 'retryCount', (task.retryCount || 0) + 1)

    // 重置为 pending 并启动
    await this.updateStatus(taskId, { state: 'pending' })
    await this.startTask(taskId)
  }

  // =========================================================================
  // 权限确认集成（ask 效果）
  // =========================================================================

  /**
   * 将任务置为等待确认状态
   *
   * 当权限检查返回 ask 效果时调用此方法，暂停任务执行
   */
  async setWaitingApproval(
    taskId: string,
    approvalPromise: Promise<boolean>
  ): Promise<boolean> {
    const task = await this.store.get(taskId)
    if (!task) throw taskNotFound(taskId)

    // 暂停超时计时
    this.clearTaskTimeout(taskId)

    await this.updateStatus(taskId, { state: 'waiting_approval' })
    log(`Task ${taskId} waiting for approval`)
    this.emit({ type: 'waiting_approval', taskId })

    // 注册 resolve/reject 供外部调用
    return new Promise<boolean>((resolve, reject) => {
      this.pendingApprovals.set(taskId, { resolve, reject })

      approvalPromise
        .then((approved) => {
          this.pendingApprovals.delete(taskId)
          this.emit({ type: 'approval_resolved', taskId, approved })

          if (approved) {
            // 恢复执行
            this.emit({ type: 'started', taskId })
            this.setTaskTimeout(taskId, task.timeout || this.defaultTimeout)
            resolve(true)
          } else {
            this.failTask(taskId, 'Permission denied by user').then(() => resolve(false))
          }
        })
        .catch((err) => {
          this.pendingApprovals.delete(taskId)
          reject(err)
        })
    })
  }

  /**
   * 解析任务确认（由外部调用，如消息通道）
   */
  resolveApproval(taskId: string, approved: boolean): void {
    const pending = this.pendingApprovals.get(taskId)
    if (!pending) {
      console.warn(`[TaskManager] No pending approval for task ${taskId}`)
      return
    }

    pending.resolve(approved)
  }

  /**
   * 拒绝任务确认
   */
  rejectApproval(taskId: string, reason: string): void {
    const pending = this.pendingApprovals.get(taskId)
    if (!pending) return

    pending.reject(new Error(reason))
    this.pendingApprovals.delete(taskId)
  }

  // =========================================================================
  // 任务分配
  // =========================================================================

  async assignTask(
    taskId: string,
    agentId: { type: 'user' | 'agent' | 'system'; id: string }
  ): Promise<void> {
    const task = await this.store.get(taskId)
    if (!task) throw taskNotFound(taskId)

    await this.store.updateField(taskId, 'assignedAgent', agentId)
  }

  // =========================================================================
  // 事件系统
  // =========================================================================

  /**
   * 订阅事件
   */
  subscribe(eventType: string, listener: TaskEventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(listener)

    return () => {
      this.listeners.get(eventType)?.delete(listener)
    }
  }

  /**
   * 订阅一次性事件（触发一次后自动取消）
   */
  once(eventType: string, listener: TaskEventListener): () => void {
    const wrapped: TaskEventListener = (event) => {
      listener(event)
      this.listeners.get(eventType)?.delete(wrapped)
    }
    return this.subscribe(eventType, wrapped)
  }

  /**
   * 发出事件
   */
  private emit(event: TaskEvent): void {
    const typeSpecific = this.listeners.get(event.type)
    if (typeSpecific) {
      typeSpecific.forEach((listener) => {
        try {
          listener(event)
        } catch (err) {
          console.error(`[TaskManager] Listener error for ${event.type}:`, err)
        }
      })
    }

    // 广播到 '*' 监听器
    const wildcard = this.listeners.get('*')
    if (wildcard) {
      wildcard.forEach((listener) => {
        try {
          listener(event)
        } catch (err) {
          console.error(`[TaskManager] Wildcard listener error:`, err)
        }
      })
    }
  }

  // =========================================================================
  // 私有辅助
  // =========================================================================

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error('TaskManager has been destroyed')
    }
  }

  private setTaskTimeout(taskId: string, timeoutMs: number): void {
    this.clearTaskTimeout(taskId)

    const handle = setTimeout(async () => {
      if (this.destroyed) return
      log(`Task ${taskId} timed out after ${timeoutMs}ms`)

      this.clearRetry(taskId)

      await this.updateStatus(taskId, {
        state: 'timeout',
        timedOutAt: Date.now(),
      })

      this.emit({ type: 'timeout', taskId })

      // 向下传播：取消子任务
      const task = await this.store.get(taskId)
      if (task?.childTaskIds?.length) {
        await this.cancelChildren(taskId, task.childTaskIds)
      }

      // 向上传播
      if (task?.parentTaskId) {
        await this.handleChildFailure(task.parentTaskId, taskId, 'Task timeout')
      }
    }, timeoutMs)

    this.activeTimeouts.set(taskId, handle)
  }

  private clearTaskTimeout(taskId: string): void {
    const handle = this.activeTimeouts.get(taskId)
    if (handle) {
      clearTimeout(handle)
      this.activeTimeouts.delete(taskId)
    }
  }

  private clearRetry(taskId: string): void {
    const handle = this.retrySchedules.get(taskId)
    if (handle) {
      clearTimeout(handle)
      this.retrySchedules.delete(taskId)
    }
    this.retryState.delete(taskId)
  }

  private async cancelChildren(parentTaskId: string, childIds: string[]): Promise<void> {
    for (const childId of childIds) {
      const child = await this.store.get(childId)
      if (child && child.status.state !== 'completed' && child.status.state !== 'cancelled') {
        try {
          await this.cancelTask(childId)
        } catch {
          // 忽略已取消的任务
        }
      }
    }
  }

  private async updateStatus(taskId: string, status: Partial<TaskStatus>): Promise<void> {
    const task = await this.store.get(taskId)
    if (!task) return

    const currentStatus = task.status as TaskStatus
    await this.store.updateStatus(taskId, { ...currentStatus, ...status } as TaskStatus)
  }

  /**
   * 处理子任务失败对父任务的影响
   */
  private async handleChildFailure(
    parentTaskId: string,
    childTaskId: string,
    error: string
  ): Promise<void> {
    const strategy = this.parentCompletionStrategy

    if (strategy === 'all_success') {
      log(`Parent task ${parentTaskId} failing due to child ${childTaskId}`)
      await this.failTask(parentTaskId, `Child task failed: ${error}`, 'ignore_parent')
    }
    // any_success 和 manual 策略下，父任务不受子任务失败影响
  }

  /**
   * 检查父任务是否应该完成
   */
  private async checkParentCompletion(parentTaskId: string): Promise<void> {
    const parent = await this.store.get(parentTaskId)
    if (!parent?.childTaskIds?.length) return

    const children = await Promise.all(
      parent.childTaskIds.map((id) => this.store.get(id))
    )

    const states = children.map((c) => c?.status.state)
    const strategy = this.parentCompletionStrategy

    // any_success：任一成功即成功
    if (strategy === 'any_success') {
      const anySuccess = states.some((s) => s === 'completed')
      const allDone = states.every(
        (s) => s === 'completed' || s === 'cancelled' || s === 'failed'
      )

      if (anySuccess) {
        await this.completeParent(parent, children)
      } else if (allDone) {
        // 全部失败
        await this.failTask(parentTaskId, 'All child tasks failed', 'ignore_parent')
      }
      return
    }

    // all_success：全部成功才算成功
    const allSuccess = states.every((s) => s === 'completed')
    const allDone = states.every(
      (s) => s === 'completed' || s === 'cancelled' || s === 'failed'
    )

    if (allSuccess) {
      await this.completeParent(parent, children)
    } else if (allDone) {
      // 有失败
      const failedErrors = children
        .filter((c) => c?.status.state === 'failed')
        .map((c) => (c!.status as { state: 'failed'; error: string }).error)
        .join('; ')
      await this.failTask(parentTaskId, `Child tasks failed: ${failedErrors}`, 'ignore_parent')
    }
  }

  private async completeParent(parent: Task, children: (Task | undefined)[]): Promise<void> {
    const results = children
      .filter((c) => c?.status.state === 'completed')
      .map((c) => (c!.status as { state: 'completed'; result: unknown }).result)

    await this.updateStatus(parent.id, {
      state: 'completed',
      result: results,
      completedAt: Date.now(),
    })

    log(`Parent task ${parent.id} completed (${results.length} children)`)
    this.emit({ type: 'completed', taskId: parent.id, result: results })
  }
}
