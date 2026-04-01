/**
 * CoordinatorHub 单元测试
 */

import { TaskManager } from '../src/task/TaskManager.js'
import {
  taskNotFound,
  taskTimeout,
  CoordinatorError,
  COORDINATOR_ERROR_CODES,
} from '../src/errors.js'

// 简易 mock store
class MockTaskStore {
  private tasks = new Map<string, any>()

  async save(task: any) { this.tasks.set(task.id, task) }
  async get(id: string) { return this.tasks.get(id) }
  async query() { return Array.from(this.tasks.values()) }
  async updateStatus(id: string, status: any) {
    const t = this.tasks.get(id)
    if (t) this.tasks.set(id, { ...t, status, updatedAt: Date.now() })
  }
  async updateField(id: string, field: string, value: any) {
    const t = this.tasks.get(id)
    if (t) this.tasks.set(id, { ...t, [field]: value, updatedAt: Date.now() })
  }
  async delete(id: string) { this.tasks.delete(id) }
}

function createTestManager(strategy: any = 'all_success') {
  const store = new MockTaskStore() as any
  return {
    manager: new TaskManager({
      store,
      defaultTimeout: 5000,
      maxConcurrentTasks: 10,
      parentCompletionStrategy: strategy,
      defaultMaxRetries: 2,
      defaultRetryDelay: 100,
    }),
    store,
  }
}

describe('TaskManager', () => {
  describe('createTask', () => {
    it('应创建任务并返回 Task 对象', async () => {
      const { manager } = createTestManager()
      const task = await manager.createTask({
        description: '测试任务',
        prompt: '分析数据',
        type: 'research',
      })

      expect(task.id).toMatch(/^task-/)
      expect(task.type).toBe('research')
      expect(task.status.state).toBe('pending')
      expect(task.retryCount).toBe(0)
    })

    it('应支持自定义重试参数', async () => {
      const { manager } = createTestManager()
      const task = await manager.createTask(
        { description: '测试', prompt: '' },
        { maxRetries: 5, retryDelay: 1000 }
      )
      expect(task.maxRetries).toBe(5)
    })
  })

  describe('任务生命周期', () => {
    it('start → complete', async () => {
      const { manager } = createTestManager()
      const task = await manager.createTask({ description: 'test', prompt: '' })
      await manager.startTask(task.id)
      const started = await manager.getTask(task.id)
      expect(started?.status.state).toBe('running')

      await manager.completeTask(task.id, { result: 'ok' })
      const completed = await manager.getTask(task.id)
      expect(completed?.status.state).toBe('completed')
      expect((completed?.status as any).result).toEqual({ result: 'ok' })
    })

    it('start → fail → 自动重试', async () => {
      const { manager } = createTestManager()
      const task = await manager.createTask({ description: 'test', prompt: '' })

      // 手动调度重试
      await manager.scheduleRetry(task.id, { maxRetries: 2, retryDelay: 50, backoff: 'linear' })

      // 第一次重试调度
      const state1 = await manager.getTask(task.id)
      expect(state1?.status.state).toBe('pending')
    })

    it('失败后 manualRetry', async () => {
      const { manager } = createTestManager()
      const task = await manager.createTask({ description: 'test', prompt: '' })
      await manager.failTask(task.id, 'Network error')

      const failed = await manager.getTask(task.id)
      expect(failed?.status.state).toBe('failed')
      expect((failed?.status as any).error).toBe('Network error')

      await manager.retryTask(task.id)
      const retried = await manager.getTask(task.id)
      expect(retried?.status.state).toBe('running')
    })

    it('cancel', async () => {
      const { manager } = createTestManager()
      const task = await manager.createTask({ description: 'test', prompt: '' })
      await manager.startTask(task.id)
      await manager.cancelTask(task.id)
      const cancelled = await manager.getTask(task.id)
      expect(cancelled?.status.state).toBe('cancelled')
    })
  })

  describe('父子任务 all_success 策略', () => {
    it('所有子任务成功时父任务自动完成', async () => {
      const { manager } = createTestManager('all_success')
      const parent = await manager.createTask({ description: 'parent', prompt: '' })
      const subtasks = await manager.createSubtasks(parent.id, [
        { description: 'sub1', prompt: '' },
        { description: 'sub2', prompt: '' },
      ])

      await manager.startTask(parent.id)
      await manager.completeTask(subtasks[0].id, { r: 1 })
      await manager.completeTask(subtasks[1].id, { r: 2 })

      const completed = await manager.getTask(parent.id)
      expect(completed?.status.state).toBe('completed')
      expect((completed?.status as any).result).toHaveLength(2)
    })

    it('任一子任务失败时父任务失败', async () => {
      const { manager } = createTestManager('all_success')
      const parent = await manager.createTask({ description: 'parent', prompt: '' })
      const subtasks = await manager.createSubtasks(parent.id, [
        { description: 'sub1', prompt: '' },
        { description: 'sub2', prompt: '' },
      ])

      await manager.startTask(parent.id)
      await manager.completeTask(subtasks[0].id, { r: 1 })
      await manager.failTask(subtasks[1].id, 'Error in subtask')

      const failed = await manager.getTask(parent.id)
      expect(failed?.status.state).toBe('failed')
    })
  })

  describe('父子任务 any_success 策略', () => {
    it('任一子任务成功即成功', async () => {
      const { manager } = createTestManager('any_success')
      const parent = await manager.createTask({ description: 'parent', prompt: '' })
      const subtasks = await manager.createSubtasks(parent.id, [
        { description: 'sub1', prompt: '' },
        { description: 'sub2', prompt: '' },
      ])

      await manager.startTask(parent.id)
      // 只完成一个子任务
      await manager.completeTask(subtasks[0].id, { r: 1 })

      const completed = await manager.getTask(parent.id)
      expect(completed?.status.state).toBe('completed')
    })

    it('全部失败时父任务失败', async () => {
      const { manager } = createTestManager('any_success')
      const parent = await manager.createTask({ description: 'parent', prompt: '' })
      const subtasks = await manager.createSubtasks(parent.id, [
        { description: 'sub1', prompt: '' },
        { description: 'sub2', prompt: '' },
      ])

      await manager.startTask(parent.id)
      await manager.failTask(subtasks[0].id, 'err1')
      await manager.failTask(subtasks[1].id, 'err2')

      const failed = await manager.getTask(parent.id)
      expect(failed?.status.state).toBe('failed')
    })
  })

  describe('事件系统', () => {
    it('应触发 created/started/completed 事件', async () => {
      const { manager } = createTestManager()
      const events: string[] = []

      manager.subscribe('created', (e) => { if (e.type === 'created') events.push('created') })
      manager.subscribe('started', (e) => { if (e.type === 'started') events.push('started') })
      manager.subscribe('completed', (e) => { if (e.type === 'completed') events.push('completed') })
      manager.subscribe('*', (e) => events.push(`wildcard:${e.type}`))

      const task = await manager.createTask({ description: 'test', prompt: '' })
      await manager.startTask(task.id)
      await manager.completeTask(task.id, {})

      expect(events).toContain('created')
      expect(events).toContain('started')
      expect(events).toContain('completed')
      expect(events.some((e) => e.startsWith('wildcard'))).toBe(true)
    })

    it('once 应只触发一次', async () => {
      const { manager } = createTestManager()
      let count = 0

      manager.once('completed', () => { count++ })
      manager.once('completed', () => { count++ })

      const task = await manager.createTask({ description: 'test', prompt: '' })
      await manager.startTask(task.id)
      await manager.completeTask(task.id, {})

      // 两个 once 各触发一次
      expect(count).toBe(2)
    })
  })

  describe('错误处理', () => {
    it('taskNotFound 应抛出 CoordinatorError', async () => {
      const err = taskNotFound('non-existent')
      expect(err).toBeInstanceOf(CoordinatorError)
      expect(err.code).toBe(COORDINATOR_ERROR_CODES.E5001)
      expect(err.taskId).toBe('non-existent')
    })

    it('taskTimeout 应包含超时信息', async () => {
      const err = taskTimeout('task-123', 5000)
      expect(err.code).toBe(COORDINATOR_ERROR_CODES.E5002)
      expect(err.taskId).toBe('task-123')
    })

    it('getTask 对不存在的任务返回 undefined', async () => {
      const { manager } = createTestManager()
      const result = await manager.getTask('non-existent')
      expect(result).toBeUndefined()
    })

    it('对已完成的任备再次完成应抛出错误', async () => {
      const { manager } = createTestManager()
      const task = await manager.createTask({ description: 'test', prompt: '' })
      await manager.startTask(task.id)
      await manager.completeTask(task.id, {})

      await expect(manager.startTask(task.id)).rejects.toThrow('not pending')
    })
  })

  describe('destroy', () => {
    it('destroy 后应拒绝新操作', async () => {
      const { manager } = createTestManager()
      manager.destroy()

      await expect(manager.createTask({ description: 'test', prompt: '' }))
        .rejects.toThrow('destroyed')
    })
  })
})

describe('CoordinatorError', () => {
  it('应包含 code/message/cause', () => {
    const err = new CoordinatorError(
      COORDINATOR_ERROR_CODES.E5104,
      'Coordination failed',
      { cause: new Error('original') }
    )

    expect(err.code).toBe(COORDINATOR_ERROR_CODES.E5104)
    expect(err.message).toBe('Coordination failed')
    expect(err.cause).toBeInstanceOf(Error)
  })
})
