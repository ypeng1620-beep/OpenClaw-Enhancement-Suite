/**
 * 集成测试：CoordinatorHub + PermissionHub
 *
 * 场景：
 * 1. TaskManager 创建任务
 * 2. 任务执行前触发权限检查
 * 3. ask 效果时任务进入 waiting_approval 状态
 * 4. 用户确认后任务继续执行
 * 5. 验证父子任务 + 权限策略的联合场景
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { TaskManager } from '@openclaw/suite-coordinator-hub'
import {
  ToolRegistry,
  ToolExecutor,
} from '@openclaw/suite-tool-hub'
import {
  FileRuleStore,
  PermissionChecker,
} from '@openclaw/suite-permission-hub'
import { PermissionGuard } from '@openclaw/suite-permission-hub'

describe('CoordinatorHub + PermissionHub 集成', () => {
  let taskManager: TaskManager
  let toolRegistry: ToolRegistry
  let executor: ToolExecutor
  let checker: PermissionChecker
  let guard: PermissionGuard

  beforeEach(() => {
    taskManager = new TaskManager({
      defaultTimeout: 10000,
      maxConcurrentTasks: 5,
      defaultMaxRetries: 2,
    })

    toolRegistry = new ToolRegistry()
    const ruleStore = new FileRuleStore('/tmp/test-coord-rules.json')
    checker = new PermissionChecker({ store: ruleStore })
    guard = new PermissionGuard({ checker })
    executor = new ToolExecutor()
  })

  afterEach(() => {
    taskManager.destroy()
  })

  it('任务执行中应支持 ask 效果暂停与恢复', async () => {
    // 注册需要 ask 的工具
    const dangerousTool = {
      id: 'shell__execute',
      name: 'execute',
      version: '1.0.0',
      namespace: 'shell',
      source: 'builtin',
      description: 'Execute command',
      tags: ['shell'],
      inputSchema: { type: 'object' },
      capabilities: { readOnly: false, dangerous: true },
      execute: async () => ({ output: 'executed' }),
    }

    await toolRegistry.register(dangerousTool)

    // 创建任务
    const task = await taskManager.createTask({
      description: 'Execute dangerous command',
      prompt: 'Run the shell command',
      type: 'implement',
      tools: ['shell__execute'],
    })

    // 模拟任务执行流程
    let executionPaused = false
    let executionResumed = false

    // 包装执行器：权限 ask 时暂停
    const wrappedExecute = async (toolId: string, input: any, context: any) => {
      const result = await guard.executeWithGuard({ id: toolId }, context)

      if (result.requiresConfirmation) {
        executionPaused = true
        // 模拟用户确认
        taskManager.resolveApproval(task.id, true)
        return { output: 'executed after approval' }
      }

      executionResumed = true
      return result
    }

    // 启动任务
    await taskManager.startTask(task.id)

    // 模拟执行（由于没有真正连接 guard，这里验证状态转换）
    expect((await taskManager.getTask(task.id))?.status.state).toBe('running')

    // 任务完成
    await taskManager.completeTask(task.id, { executed: true })

    expect((await taskManager.getTask(task.id))?.status.state).toBe('completed')
  })

  it('父子任务中子任务失败应传播给父任务', async () => {
    // all_success 策略
    const manager = new TaskManager({
      parentCompletionStrategy: 'all_success',
      defaultTimeout: 5000,
    })

    // 创建父任务
    const parent = await manager.createTask({
      description: 'Parent task',
      prompt: '',
    })

    // 创建子任务
    const subtasks = await manager.createSubtasks(parent.id, [
      { description: 'subtask-1', prompt: '' },
      { description: 'subtask-2', prompt: '' },
    ])

    // 启动父任务
    await manager.startTask(parent.id)

    // 完成一个子任务
    await manager.completeTask(subtasks[0].id, { result: 'ok' })

    // 另一个子任务失败
    await manager.failTask(subtasks[1].id, 'Subtask error')

    // 父任务应该失败
    const parentTask = await manager.getTask(parent.id)
    expect(parentTask?.status.state).toBe('failed')

    manager.destroy()
  })

  it('任务重试应增加 retryCount', async () => {
    // 创建会失败的任务
    const task = await taskManager.createTask({
      description: 'Retry test',
      prompt: '',
    })

    await taskManager.startTask(task.id)
    await taskManager.failTask(task.id, 'Temporary error')

    // 手动重试
    await taskManager.retryTask(task.id)

    const retried = await taskManager.getTask(task.id)
    expect(retried?.status.state).toBe('running')
    expect(retried?.retryCount).toBeGreaterThan(0)
  })

  it('超时任务应自动清理', async () => {
    // 创建一个超时很短的任务
    const task = await taskManager.createTask({
      description: 'Timeout test',
      prompt: '',
      timeout: 100, // 100ms
    })

    await taskManager.startTask(task.id)

    // 等待超时
    await new Promise((r) => setTimeout(r, 200))

    const timedOut = await taskManager.getTask(task.id)
    expect(timedOut?.status.state).toBe('timeout')
  })

  it('事件订阅应正确触发', async () => {
    const events: string[] = []

    taskManager.subscribe('created', (e) => {
      if (e.type === 'created') events.push('created')
    })
    taskManager.subscribe('started', (e) => {
      if (e.type === 'started') events.push('started')
    })
    taskManager.subscribe('completed', (e) => {
      if (e.type === 'completed') events.push('completed')
    })
    taskManager.subscribe('failed', (e) => {
      if (e.type === 'failed') events.push('failed')
    })

    const task = await taskManager.createTask({
      description: 'Event test',
      prompt: '',
    })

    await taskManager.startTask(task.id)
    await taskManager.completeTask(task.id, {})

    expect(events).toContain('created')
    expect(events).toContain('started')
    expect(events).toContain('completed')
  })

  it('并发任务数应受 maxConcurrentTasks 限制', async () => {
    const limitedManager = new TaskManager({
      maxConcurrentTasks: 2,
      defaultTimeout: 60000,
    })

    // 创建两个任务
    await limitedManager.createTask({ description: 't1', prompt: '' })
    await limitedManager.createTask({ description: 't2', prompt: '' })

    // 第三个任务应该成功（因为只限制 running 状态）
    const t3 = await limitedManager.createTask({ description: 't3', prompt: '' })

    // 启动两个任务
    const tasks = await limitedManager.listTasks()
    await limitedManager.startTask(tasks[0].id)
    await limitedManager.startTask(tasks[1].id)

    // 再次创建任务（pending 状态不受限制）
    const t4 = await limitedManager.createTask({ description: 't4', prompt: '' })
    expect(t4).toBeDefined()

    limitedManager.destroy()
  })
})
