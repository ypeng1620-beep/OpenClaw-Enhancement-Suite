/**
 * 任务管理器
 *
 * 负责任务的创建、状态跟踪、和生命周期管理
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
} from '../errors.js'

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
}

/**
 * 任务存储接口
 */
export interface TaskStore {
  save(task: Task): Promise<void>
  get(taskId: string): Promise<Task | undefined>
  query(filter?: TaskFilter): Promise<Task[]>
  updateStatus(taskId: string, status: TaskStatus): Promise<void>
  delete(taskId: string): Promise<void>
}

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

  async delete(taskId: string): Promise<void> {
    this.tasks.delete(taskId)
  }
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

/**
 * 任务管理器
 */
export class TaskManager {
  private readonly store: TaskStore
  private readonly defaultTimeout: number
  private readonly maxConcurrentTasks: number
  private readonly listeners: Set<TaskEventListener> = new Set()
  private readonly activeTasks = new Map<string, NodeJS.Timeout>()

  constructor(options: TaskManagerOptions = {}) {
    this.store = options.store || new MemoryTaskStore()
    this.defaultTimeout = options.defaultTimeout || 300000 // 5 分钟
    this.maxConcurrentTasks = options.maxConcurrentTasks || 10
  }

  // =========================================================================
  // 任务创建
  // =========================================================================

  /**
   * 创建任务
   */
  async createTask(submission: TaskSubmission): Promise<Task> {
    // 检查并发限制
    const activeCount = await this.getActiveTaskCount()
    if (activeCount >= this.maxConcurrentTasks) {
      throw new Error(`Max concurrent tasks (${this.maxConcurrentTasks}) reached`)
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
    }

    await this.store.save(task)
    this.emit({ type: 'created', task })

    return task
  }

  /**
   * 批量创建子任务
   */
  async createSubtasks(
    parentTaskId: string,
    submissions: TaskSubmission[]
  ): Promise<Task[]> {
    const parent = await this.store.get(parentTaskId)
    if (!parent) {
      throw taskNotFound(parentTaskId)
    }

    const subtasks = await Promise.all(
      submissions.map((sub) =>
        this.createTask({
          ...sub,
          parentTaskId,
          type: sub.type || parent.type,
        })
      )
    )

    // 更新父任务的子任务列表
    await this.store.updateStatus(parentTaskId, {
      ...parent.status,
    })

    return subtasks
  }

  // =========================================================================
  // 任务查询
  // =========================================================================

  /**
   * 获取任务
   */
  async getTask(taskId: string): Promise<Task | undefined> {
    return this.store.get(taskId)
  }

  /**
   * 列出任务
   */
  async listTasks(filter?: TaskFilter): Promise<Task[]> {
    return this.store.query(filter)
  }

  /**
   * 获取活跃任务数
   */
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
    const task = await this.store.get(taskId)
    if (!task) {
      throw taskNotFound(taskId)
    }

    if (task.status.state !== 'pending') {
      throw new Error(`Task ${taskId} is not pending`)
    }

    await this.store.updateStatus(taskId, {
      state: 'running',
      startedAt: Date.now(),
    })

    this.emit({ type: 'started', taskId })

    // 设置超时
    const timeout = task.timeout || this.defaultTimeout
    const timeoutHandle = setTimeout(() => {
      this.handleTaskTimeout(taskId)
    }, timeout)

    this.activeTasks.set(taskId, timeoutHandle)
  }

  /**
   * 更新任务进度
   */
  async updateProgress(
    taskId: string,
    progress: number,
    message?: string
  ): Promise<void> {
    const task = await this.store.get(taskId)
    if (!task) {
      throw taskNotFound(taskId)
    }

    this.emit({ type: 'progress', taskId, progress, message })
  }

  /**
   * 完成任务
   */
  async completeTask(taskId: string, result: unknown): Promise<void> {
    const task = await this.store.get(taskId)
    if (!task) {
      throw taskNotFound(taskId)
    }

    this.cancelTimeout(taskId)

    await this.store.updateStatus(taskId, {
      state: 'completed',
      result,
      completedAt: Date.now(),
    })

    this.emit({ type: 'completed', taskId, result })

    // 如果是子任务，检查父任务是否应该完成
    if (task.parentTaskId) {
      await this.checkParentCompletion(task.parentTaskId)
    }
  }

  /**
   * 标记任务失败
   */
  async failTask(taskId: string, error: string): Promise<void> {
    this.cancelTimeout(taskId)

    await this.store.updateStatus(taskId, {
      state: 'failed',
      error,
      failedAt: Date.now(),
    })

    this.emit({ type: 'failed', taskId, error })

    // 如果是父任务，可能需要取消子任务
    const task = await this.store.get(taskId)
    if (task?.childTaskIds?.length) {
      for (const childId of task.childTaskIds) {
        try {
          await this.cancelTask(childId)
        } catch {
          // 忽略已取消的任务
        }
      }
    }
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<void> {
    const task = await this.store.get(taskId)
    if (!task) {
      throw taskNotFound(taskId)
    }

    if (task.status.state === 'completed' || task.status.state === 'cancelled') {
      return // 无需取消
    }

    this.cancelTimeout(taskId)

    await this.store.updateStatus(taskId, {
      state: 'cancelled',
      cancelledAt: Date.now(),
    })

    this.emit({ type: 'cancelled', taskId })
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<void> {
    this.cancelTimeout(taskId)
    await this.store.delete(taskId)
    this.emit({ type: 'deleted', taskId })
  }

  // =========================================================================
  // 任务分配
  // =========================================================================

  /**
   * 分配任务给 Agent
   */
  async assignTask(
    taskId: string,
    agentId: { type: 'user' | 'agent' | 'system'; id: string }
  ): Promise<void> {
    const task = await this.store.get(taskId)
    if (!task) {
      throw taskNotFound(taskId)
    }

    await this.store.save({
      ...task,
      assignedAgent: agentId,
      updatedAt: Date.now(),
    })
  }

  // =========================================================================
  // 监听
  // =========================================================================

  /**
   * 订阅任务事件
   */
  subscribe(listener: TaskEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 发出事件
   */
  private emit(event: TaskEvent): void {
    this.listeners.forEach((listener) => listener(event))
  }

  // =========================================================================
  // 辅助
  // =========================================================================

  private cancelTimeout(taskId: string): void {
    const handle = this.activeTasks.get(taskId)
    if (handle) {
      clearTimeout(handle)
      this.activeTasks.delete(taskId)
    }
  }

  private handleTaskTimeout(taskId: string): void {
    this.store.updateStatus(taskId, {
      state: 'timeout',
      timedOutAt: Date.now(),
    })
    this.emit({ type: 'timeout', taskId })
  }

  private async checkParentCompletion(parentTaskId: string): Promise<void> {
    const parent = await this.store.get(parentTaskId)
    if (!parent?.childTaskIds?.length) return

    const children = await Promise.all(
      parent.childTaskIds.map((id) => this.store.get(id))
    )

    const allCompleted = children.every(
      (c) =>
        c?.status.state === 'completed' ||
        c?.status.state === 'cancelled' ||
        c?.status.state === 'failed'
    )

    if (allCompleted) {
      const results = children
        .filter((c) => c?.status.state === 'completed')
        .map((c) => c!.status.state === 'completed' ? (c!.status as { state: 'completed'; result: unknown }).result : null)

      await this.store.updateStatus(parentTaskId, {
        state: 'completed',
        result: results,
        completedAt: Date.now(),
      })

      this.emit({ type: 'completed', taskId: parentTaskId, result: results })
    }
  }
}
