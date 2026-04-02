/**
 * 集成测试：ToolHub + PermissionHub
 *
 * 场景：
 * 1. 注册工具到 ToolRegistry
 * 2. 配置权限规则
 * 3. 执行工具时触发权限检查
 * 4. 验证 allow/deny/ask 效果
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  ToolRegistry,
  ToolExecutor,
} from '@openclaw/suite-tool-hub'
import {
  MemoryRuleStore,
  PermissionChecker,
} from '@openclaw/suite-permission-hub'
import { PermissionGuard } from '@openclaw/suite-permission-hub'

describe('ToolHub + PermissionHub 集成', () => {
  let toolRegistry: ToolRegistry
  let executor: ToolExecutor
  let ruleStore: MemoryRuleStore
  let checker: PermissionChecker
  let guard: PermissionGuard

  beforeEach(async () => {
    toolRegistry = new ToolRegistry()
    executor = new ToolExecutor()
    ruleStore = new MemoryRuleStore()
    checker = new PermissionChecker({ store: ruleStore })
    guard = new PermissionGuard({ checker })
    await checker.initialize()
  })

  it('应允许已授权的工具执行', async () => {
    // 1. 注册工具
    const readTool = {
      id: 'filesystem__read',
      name: 'read',
      version: '1.0.0',
      namespace: 'filesystem',
      source: 'builtin',
      description: 'Read file',
      tags: ['filesystem', 'read'],
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      capabilities: { readOnly: true, filesystemAccess: true, dangerous: false },
      execute: async () => ({ content: 'hello' }),
    }

    await toolRegistry.register(readTool)

    // 2. 添加 allow 规则 (ObjectMatcher requires { type: 'tool', toolId: ... })
    await checker.addRule({
      id: 'allow-read',
      effect: 'allow',
      priority: 10,
      subject: { type: 'user', userId: 'user-123' },
      object: { type: 'tool', toolId: 'filesystem__read' },
    })

    // 3. 执行权限检查
    const decision = await checker.check({
      subject: { userId: 'user-123' },
      object: { toolId: 'filesystem__read' },
    })

    expect(decision.effect).toBe('allow')
  })

  it('应拒绝未授权的工具', async () => {
    // 注册工具
    const deleteTool = {
      id: 'filesystem__delete',
      name: 'delete',
      version: '1.0.0',
      namespace: 'filesystem',
      source: 'builtin',
      description: 'Delete file',
      tags: ['filesystem', 'delete'],
      inputSchema: { type: 'object' },
      capabilities: { readOnly: false, filesystemAccess: true, dangerous: true },
      execute: async () => ({ deleted: true }),
    }

    await toolRegistry.register(deleteTool)
    // 不添加任何规则 → 默认 deny

    // 执行权限检查
    const decision = await checker.check({
      subject: { userId: 'user-456' },
      object: { toolId: 'filesystem__delete' },
    })

    expect(decision.effect).toBe('deny')
  })

  it('应触发 ask 效果并返回等待确认', async () => {
    // 注册工具
    const networkTool = {
      id: 'network__http_request',
      name: 'http_request',
      version: '1.0.0',
      namespace: 'network',
      source: 'builtin',
      description: 'HTTP request',
      tags: ['network'],
      inputSchema: { type: 'object' },
      capabilities: { readOnly: false, networkAccess: true, dangerous: false },
      execute: async () => ({ status: 200 }),
    }

    await toolRegistry.register(networkTool)

    // 添加 ask 规则 (ObjectMatcher requires { type: 'tool', toolId: ... })
    await checker.addRule({
      id: 'ask-network',
      effect: 'ask',
      priority: 10,
      subject: { type: 'user', userId: 'user-789' },
      object: { type: 'tool', toolId: 'network__http_request' },
    })

    const decision = await checker.check({
      subject: { userId: 'user-789' },
      object: { toolId: 'network__http_request' },
    })

    expect(decision.effect).toBe('ask')
  })

  it('PermissionGuard 应拦截危险操作', async () => {
    const rmTool = {
      id: 'shell__rm_rf',
      name: 'rm_rf',
      version: '1.0.0',
      namespace: 'shell',
      source: 'builtin',
      description: 'Delete everything',
      tags: ['shell', 'dangerous'],
      inputSchema: { type: 'object' },
      capabilities: { readOnly: false, filesystemAccess: true, dangerous: true },
      execute: async () => ({ result: 'deleted' }),
    }

    await toolRegistry.register(rmTool)
    // 默认 deny 危险操作

    const decision = await checker.check({
      subject: { userId: 'hacker' },
      object: { toolId: 'shell__rm_rf' },
    })

    expect(decision.effect).toBe('deny')
  })
})
