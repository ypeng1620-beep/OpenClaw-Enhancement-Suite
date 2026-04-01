# PermissionHub

> 权限规则引擎

## 状态

✅ Phase 2 完成

## 功能

### 规则引擎 (RuleEngine)
- 按优先级匹配规则
- 三种效果：`allow` / `deny` / `ask`
- 批量检查
- 模拟检查（what-if）
- 规则验证

### 权限检查器 (PermissionChecker)
- 集成 RuleEngine + RuleStore
- 规则热更新
- 缓存 + 版本检查

### 权限守卫 (PermissionGuard)
- 工具级别保护
- 白名单/黑名单
- 中间件模式

### 规则存储 (RuleStore)
- **MemoryRuleStore**: 内存存储（默认）
- **FileRuleStore**: 文件存储（持久化）
- **RemoteRuleStore**: 远程轮询（配置中心）

## 使用示例

### 基本使用

```typescript
import {
  PermissionChecker,
  PermissionRule,
} from '@openclaw/suite-permission-hub'

// 定义规则
const rules: PermissionRule[] = [
  {
    id: 'allow-stock-tools',
    priority: 10,
    effect: 'allow',
    subject: { type: 'agent', agentId: 'chengcai' },
    object: { type: 'tag', tag: 'stock' },
  },
  {
    id: 'deny-delete',
    priority: 5,
    effect: 'deny',
    subject: { type: '*' },
    object: { type: 'tool', toolId: 'filesystem/delete' },
  },
]

// 创建检查器
const checker = new PermissionChecker({
  initialRules: rules,
})
await checker.initialize()

// 检查权限
const decision = await checker.check({
  subject: { agentId: 'chengcai' },
  object: { toolId: 'akshare/stock_daily' },
})

if (decision.effect === 'allow') {
  // 执行工具
}
```

### 使用权限守卫

```typescript
import {
  PermissionGuard,
  createPermissionGuard,
} from '@openclaw/suite-permission-hub'

const guard = await createPermissionGuard({
  rules: [...],
  blockedTools: new Set(['filesystem/delete']),
  throwOnDenied: true,
})

// 执行工具（带权限检查）
try {
  const result = await guard.executeWithGuard(tool, input, context)
} catch (error) {
  if (error instanceof PermissionDeniedError) {
    console.log('权限被拒绝:', error.toolId)
  }
}
```

### 热更新规则

```typescript
import { PermissionGuard, FileRuleStore } from '@openclaw/suite-permission-hub'

const guard = new PermissionGuard({
  checkerConfig: {
    store: new FileRuleStore('./permissions.json'),
  },
})
await guard.initialize()

// 监听规则变化
guard.getChecker().getRules().then(rules => {
  console.log('规则已更新:', rules)
})
```

## 规则 DSL

```typescript
// 主体匹配
{ type: 'user', userId: 'user-123' }      // 指定用户
{ type: 'agent', agentId: 'chengcai' }      // 指定 Agent
{ type: 'role', role: 'admin' }              // 指定角色
{ type: '*' }                               // 所有人

// 对象匹配
{ type: 'tool', toolId: 'filesystem/read' }    // 指定工具
{ type: 'namespace', namespace: 'stock' }        // 命名空间
{ type: 'tag', tag: 'dangerous' }                // 标签
{ type: 'pattern', pattern: 'network/*' }         // Glob 模式

// 操作匹配
{ type: 'call', toolId: 'Bash', args: { type: 'glob', pattern: 'rm *' } }
{ type: '*' }                                   // 所有操作
```

## API

### RuleEngine
```typescript
const engine = new RuleEngine({
  defaultEffect: 'deny',  // 默认拒绝
  allowUnknown: false,
})

engine.check(request, rules, context)     // 单个检查
engine.checkMany(requests, rules, ctx)   // 批量检查
engine.simulate(request, rules, ctx)    // 模拟检查
engine.validateRules(rules)              // 验证规则
```

### PermissionChecker
```typescript
const checker = new PermissionChecker({
  initialRules: rules,
})
await checker.initialize()

checker.check(request)                  // 检查
checker.checkMany(requests)              // 批量
checker.simulate(request)               // 模拟
checker.addRule(rule)                   // 添加规则
checker.removeRule(ruleId)              // 移除规则
```

### PermissionGuard
```typescript
const guard = await createPermissionGuard({
  rules,
  blockedTools: new Set(['delete']),
  throwOnDenied: true,
})

guard.executeWithGuard(tool, input, context)
guard.createMiddleware()
```
