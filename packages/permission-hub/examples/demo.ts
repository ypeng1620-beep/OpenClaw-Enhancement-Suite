/**
 * PermissionHub 使用示例
 *
 * 运行方式: npx tsx examples/demo.ts
 */

import {
  PermissionChecker,
  PermissionGuard,
  createPermissionGuard,
  createRuleStore,
  PermissionRule,
  PermissionRequest,
} from '../src/index.js'

async function main() {
  console.log('=== PermissionHub Demo ===\n')

  // 1. 定义规则
  console.log('1. 定义权限规则...')
  const rules: PermissionRule[] = [
    // 承财只能访问股票相关工具
    {
      id: 'chengcai-stock',
      priority: 10,
      effect: 'allow',
      subject: { type: 'agent', agentId: 'chengcai' },
      object: { type: 'tag', tag: 'stock' },
    },
    // 承财不能访问微信
    {
      id: 'chengcai-wechat',
      priority: 8,
      effect: 'deny',
      subject: { type: 'agent', agentId: 'chengcai' },
      object: { type: 'namespace', namespace: 'wechat' },
    },
    // 所有 Agent 不能删除文件
    {
      id: 'no-delete',
      priority: 5,
      effect: 'deny',
      subject: { type: '*' },
      object: { type: 'tool', toolId: 'filesystem/delete' },
    },
    // 普通用户使用网络工具需要确认
    {
      id: 'user-network-ask',
      priority: 3,
      effect: 'ask',
      subject: { type: 'user', userId: '*' },
      object: { type: 'namespace', namespace: 'network' },
    },
  ]
  console.log(`   定义了 ${rules.length} 条规则\n`)

  // 2. 使用内存存储
  console.log('2. 创建权限检查器...')
  const checker = new PermissionChecker({
    initialRules: rules,
  })
  await checker.initialize()
  console.log('   检查器已初始化\n')

  // 3. 测试各种权限场景
  console.log('3. 测试权限场景:')

  // 场景 1: 承财访问股票工具 - 应该允许
  const req1: PermissionRequest = {
    subject: { agentId: 'chengcai' },
    object: { toolId: 'akshare/stock_daily' },
  }
  const decision1 = await checker.check(req1)
  console.log(
    `   承财访问股票工具: ${decision1.effect === 'allow' ? '✅ 允许' : '❌ 拒绝'}`
  )

  // 场景 2: 承财访问微信 - 应该拒绝
  const req2: PermissionRequest = {
    subject: { agentId: 'chengcai' },
    object: { toolId: 'wechat/send' },
  }
  const decision2 = await checker.check(req2)
  console.log(
    `   承财访问微信工具: ${decision2.effect === 'deny' ? '❌ 拒绝' : '✅ 允许'}`
  )

  // 场景 3: 任何人删除文件 - 应该拒绝
  const req3: PermissionRequest = {
    subject: { agentId: '承安' },
    object: { toolId: 'filesystem/delete' },
  }
  const decision3 = await checker.check(req3)
  console.log(
    `   任何Agent删除文件: ${decision3.effect === 'deny' ? '❌ 拒绝' : '✅ 允许'}`
  )

  // 场景 4: 用户访问网络工具 - 应该询问
  const req4: PermissionRequest = {
    subject: { userId: '老爷' },
    object: { toolId: 'network/http_get' },
  }
  const decision4 = await checker.check(req4)
  console.log(
    `   用户访问网络工具: ${decision4.effect === 'ask' ? '❓ 询问' : decision4.effect === 'allow' ? '✅ 允许' : '❌ 拒绝'}`
  )
  if (decision4.effect === 'ask') {
    console.log(`   原因: ${decision4.reason}`)
  }
  console.log()

  // 4. 模拟检查
  console.log('4. 模拟检查 (承财访问股票工具):')
  const sim = await checker.simulate(req1)
  console.log(`   会被允许: ${sim.wouldBeAllowed ? '✅ 是' : '❌ 否'}`)
  console.log(`   匹配的规则: ${sim.matchedRules.join(', ') || '无'}`)
  console.log()

  // 5. 动态添加规则
  console.log('5. 动态添加规则...')
  await checker.addRule({
    id: 'temp-allow-weather',
    priority: 1,
    effect: 'allow',
    subject: { type: '*' },
    object: { type: 'tool', toolId: 'weather/query' },
  })
  const rulesAfterAdd = await checker.getRules()
  console.log(`   当前规则数: ${rulesAfterAdd.length}`)
  console.log()

  // 6. 权限守卫
  console.log('6. 使用权限守卫...')
  const guard = await createPermissionGuard({
    rules: [
      {
        id: 'guard-allow-stock',
        priority: 10,
        effect: 'allow',
        subject: { type: 'agent', agentId: 'chengcai' },
        object: { type: 'tag', tag: 'stock' },
      },
    ],
    blockedTools: new Set(['filesystem/delete']),
    throwOnDenied: false,
  })

  const mockTool = {
    id: 'test/tool',
    name: 'Test Tool',
    namespace: 'test',
    source: 'user' as const,
    description: 'test',
    tags: ['test'],
    version: '1.0.0',
    inputSchema: { type: 'object', properties: {} },
    capabilities: {
      readOnly: false,
      networkAccess: false,
      filesystemAccess: false,
      dangerous: false,
      longRunning: false,
      streaming: false,
    },
    async execute() {
      return {
        success: true,
        data: 'executed',
        metadata: { toolId: 'test/tool', durationMs: 0 },
      }
    },
  }

  const mockContext = {
    sessionId: 'demo',
    userId: 'user',
    permissions: {
      sessionId: 'demo',
      userId: 'user',
      roles: [],
      groups: [],
    },
  } as any

  // 允许的工具
  const allowed = await guard.checkToolAccess('test/tool', {}, mockContext)
  console.log(`   test/tool 是否允许: ${allowed ? '✅' : '❌'}`)

  // 被阻止的工具
  const blocked = await guard.checkToolAccess(
    'filesystem/delete',
    {},
    mockContext
  )
  console.log(`   filesystem/delete 是否允许: ${blocked ? '✅' : '❌'}`)
  console.log()

  // 7. 验证规则
  console.log('7. 验证规则语法...')
  const validation = checker.validateRules([
    { id: 'valid', priority: 1, effect: 'allow', subject: { type: '*' }, object: { type: 'tool', toolId: 'x' } },
    { id: 'invalid-no-effect', priority: 1, effect: 'invalid' as any, subject: { type: '*' }, object: { type: 'tool', toolId: 'x' } },
  ])
  console.log(`   规则有效: ${validation.valid ? '✅' : '❌'}`)
  if (!validation.valid) {
    console.log(`   错误: ${validation.errors.join(', ')}`)
  }
  console.log()

  console.log('=== Demo 完成 ===')
}

main().catch(console.error)
