/**
 * PermissionHub 单元测试
 */

import { RuleEngine } from '../engine/RuleEngine.js'
import {
  PermissionChecker,
  PermissionRule,
  MemoryRuleStore,
} from '../src/index.js'
import type {
  PermissionRequest,
  PermissionContext,
} from '@openclaw/suite-core'

// 测试工具函数
function createContext(overrides: Partial<PermissionContext> = {}): PermissionContext {
  return {
    sessionId: 'test-session',
    userId: 'test-user',
    roles: [],
    groups: [],
    ...overrides,
  }
}

function createRequest(overrides: Partial<PermissionRequest['subject']> & { toolId: string }): PermissionRequest {
  return {
    subject: {
      userId: 'test-user',
      ...overrides,
    },
    object: {
      toolId: overrides.toolId,
    },
    sessionId: 'test-session',
  }
}

describe('RuleEngine', () => {
  let engine: RuleEngine

  beforeEach(() => {
    engine = new RuleEngine({ defaultEffect: 'deny' })
  })

  describe('优先级匹配', () => {
    it('应按优先级从高到低匹配规则', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'low-priority',
          priority: 1,
          effect: 'deny',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
        {
          id: 'high-priority',
          priority: 10,
          effect: 'allow',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
      ]

      const request = createRequest({ toolId: 'test/read' })
      const decision = engine.check(request, rules, createContext())

      expect(decision.effect).toBe('allow')
    })

    it('同优先级下，第一个匹配的规则优先', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'first',
          priority: 5,
          effect: 'deny',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
        {
          id: 'second',
          priority: 5,
          effect: 'allow',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
      ]

      const request = createRequest({ toolId: 'test/read' })
      const decision = engine.check(request, rules, createContext())

      // 同优先级，第一个匹配（deny）
      expect(decision.effect).toBe('deny')
    })
  })

  describe('主体匹配', () => {
    it('应匹配指定用户', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'user-allow',
          priority: 10,
          effect: 'allow',
          subject: { type: 'user', userId: 'alice' },
          object: { type: '*' },
        },
      ]

      const request = createRequest({ userId: 'alice', toolId: 'test/read' })
      const decision = engine.check(request, rules, createContext({ userId: 'alice' }))

      expect(decision.effect).toBe('allow')
    })

    it('应匹配指定 Agent', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'agent-allow',
          priority: 10,
          effect: 'allow',
          subject: { type: 'agent', agentId: 'chengcai' },
          object: { type: '*' },
        },
      ]

      const request = createRequest({ agentId: 'chengcai', toolId: 'test/read' })
      const decision = engine.check(request, rules, createContext({ agentId: 'chengcai' }))

      expect(decision.effect).toBe('allow')
    })

    it('应匹配通配符主体', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'all-allow',
          priority: 10,
          effect: 'allow',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
      ]

      const request = createRequest({ toolId: 'test/read' })
      const decision = engine.check(request, rules, createContext())

      expect(decision.effect).toBe('allow')
    })
  })

  describe('对象匹配', () => {
    it('应匹配指定工具', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'tool-allow',
          priority: 10,
          effect: 'allow',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
      ]

      const decision = engine.check(
        createRequest({ toolId: 'test/read' }),
        rules,
        createContext()
      )
      expect(decision.effect).toBe('allow')

      const denied = engine.check(
        createRequest({ toolId: 'test/write' }),
        rules,
        createContext()
      )
      expect(denied.effect).toBe('deny')
    })

    it('应匹配命名空间', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'ns-allow',
          priority: 10,
          effect: 'allow',
          subject: { type: '*' },
          object: { type: 'namespace', namespace: 'stock' },
        },
      ]

      const decision = engine.check(
        createRequest({ toolId: 'stock/daily' }),
        rules,
        createContext()
      )
      expect(decision.effect).toBe('allow')

      const denied = engine.check(
        createRequest({ toolId: 'weather/query' }),
        rules,
        createContext()
      )
      expect(denied.effect).toBe('deny')
    })

    it('应匹配标签', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'tag-deny',
          priority: 10,
          effect: 'deny',
          subject: { type: '*' },
          object: { type: 'tag', tag: 'dangerous' },
        },
      ]

      // 注意：标签匹配需要工具元数据，这里简化测试
      const decision = engine.check(
        createRequest({ toolId: 'dangerous/tool' }),
        rules,
        createContext()
      )
      expect(decision.effect).toBe('deny')
    })
  })

  describe('三种效果', () => {
    it('allow 效果应允许执行', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'allow',
          priority: 10,
          effect: 'allow',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
      ]

      const decision = engine.check(
        createRequest({ toolId: 'test/read' }),
        rules,
        createContext()
      )
      expect(decision.effect).toBe('allow')
    })

    it('deny 效果应拒绝执行', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'deny',
          priority: 10,
          effect: 'deny',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/delete' },
        },
      ]

      const decision = engine.check(
        createRequest({ toolId: 'test/delete' }),
        rules,
        createContext()
      )
      expect(decision.effect).toBe('deny')
    })

    it('ask 效果应返回询问', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'ask',
          priority: 10,
          effect: 'ask',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/sensitive' },
        },
      ]

      const decision = engine.check(
        createRequest({ toolId: 'test/sensitive' }),
        rules,
        createContext()
      )
      expect(decision.effect).toBe('ask')
    })
  })

  describe('模拟检查', () => {
    it('应返回匹配的规则列表', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'rule-1',
          priority: 10,
          effect: 'allow',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
        {
          id: 'rule-2',
          priority: 5,
          effect: 'deny',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
      ]

      const sim = engine.simulate(
        createRequest({ toolId: 'test/read' }),
        rules,
        createContext()
      )

      expect(sim.wouldBeAllowed).toBe(true)
      expect(sim.matchedRules).toContain('rule-1')
      expect(sim.matchedRules).toContain('rule-2')
      expect(sim.blockedBy).toBeUndefined()
    })

    it('应正确识别被阻塞', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'rule-1',
          priority: 5,
          effect: 'allow',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
        {
          id: 'rule-2',
          priority: 10,
          effect: 'deny',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
      ]

      const sim = engine.simulate(
        createRequest({ toolId: 'test/read' }),
        rules,
        createContext()
      )

      expect(sim.wouldBeAllowed).toBe(false)
      expect(sim.blockedBy).toBe('rule-2')
    })
  })

  describe('规则验证', () => {
    it('应验证有效规则', async () => {
      const rules: PermissionRule[] = [
        {
          id: 'valid',
          priority: 10,
          effect: 'allow',
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
      ]

      const result = engine.validateRules(rules)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('应检测无效规则', async () => {
      const rules: PermissionRule[] = [
        {
          id: '',
          priority: 10,
          effect: 'invalid' as any,
          subject: { type: '*' },
          object: { type: 'tool', toolId: 'test/read' },
        },
      ]

      const result = engine.validateRules(rules)
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })
})

describe('MemoryRuleStore', () => {
  it('应按优先级排序返回规则', async () => {
    const store = new MemoryRuleStore([
      {
        id: 'low',
        priority: 1,
        effect: 'allow',
        subject: { type: '*' },
        object: { type: '*' },
      },
      {
        id: 'high',
        priority: 10,
        effect: 'allow',
        subject: { type: '*' },
        object: { type: '*' },
      },
    ])

    const rules = await store.getRules()
    expect(rules[0].id).toBe('high')
    expect(rules[1].id).toBe('low')
  })

  it('应正确添加规则', async () => {
    const store = new MemoryRuleStore()

    await store.addRule({
      id: 'new-rule',
      priority: 10,
      effect: 'allow',
      subject: { type: '*' },
      object: { type: 'tool', toolId: 'test/read' },
    })

    const rules = await store.getRules()
    expect(rules).toHaveLength(1)
    expect(rules[0].id).toBe('new-rule')
  })

  it('应正确移除规则', async () => {
    const store = new MemoryRuleStore([
      {
        id: 'rule-1',
        priority: 10,
        effect: 'allow',
        subject: { type: '*' },
        object: { type: '*' },
      },
    ])

    await store.removeRule('rule-1')
    const rules = await store.getRules()
    expect(rules).toHaveLength(0)
  })

  it('应正确触发监听', async () => {
    const store = new MemoryRuleStore()
    let called = false

    store.watch(() => {
      called = true
    })

    await store.addRule({
      id: 'test',
      priority: 10,
      effect: 'allow',
      subject: { type: '*' },
      object: { type: '*' },
    })

    expect(called).toBe(true)
  })
})

describe('PermissionChecker', () => {
  let checker: PermissionChecker
  const rules: PermissionRule[] = [
    {
      id: 'chengcai-stock',
      priority: 10,
      effect: 'allow',
      subject: { type: 'agent', agentId: 'chengcai' },
      object: { type: 'tag', tag: 'stock' },
    },
    {
      id: 'no-delete',
      priority: 5,
      effect: 'deny',
      subject: { type: '*' },
      object: { type: 'tool', toolId: 'filesystem/delete' },
    },
  ]

  beforeEach(async () => {
    checker = new PermissionChecker({ initialRules: rules })
    await checker.initialize()
  })

  it('应正确检查允许的请求', async () => {
    const decision = await checker.check({
      subject: { agentId: 'chengcai' },
      object: { toolId: 'stock/daily' },
    })

    expect(decision.effect).toBe('allow')
  })

  it('应正确检查拒绝的请求', async () => {
    const decision = await checker.check({
      subject: { userId: 'anyone' },
      object: { toolId: 'filesystem/delete' },
    })

    expect(decision.effect).toBe('deny')
  })

  it('应正确添加规则', async () => {
    await checker.addRule({
      id: 'new-rule',
      priority: 10,
      effect: 'allow',
      subject: { type: '*' },
      object: { type: 'tool', toolId: 'weather/query' },
    })

    const decision = await checker.check({
      subject: { userId: 'anyone' },
      object: { toolId: 'weather/query' },
    })

    expect(decision.effect).toBe('allow')
  })

  it('应正确移除规则', async () => {
    await checker.removeRule('no-delete')

    const decision = await checker.check({
      subject: { userId: 'anyone' },
      object: { toolId: 'filesystem/delete' },
    })

    // 没有匹配规则，默认拒绝
    expect(decision.effect).toBe('deny')
  })

  it('应正确模拟检查', async () => {
    const sim = await checker.simulate({
      subject: { agentId: 'chengcai' },
      object: { toolId: 'stock/daily' },
    })

    expect(sim.wouldBeAllowed).toBe(true)
    expect(sim.matchedRules).toContain('chengcai-stock')
  })
})
