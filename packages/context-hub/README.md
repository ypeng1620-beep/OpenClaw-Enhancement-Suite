# ContextHub

> 上下文压缩引擎

## 状态

✅ Phase 3 完成

## 功能

### 上下文管理器 (ContextManager)
- 事件添加和追踪
- 上下文快照
- 自动压缩检测
- 统计信息

### 递减收益检测器 (DiminishingReturnsDetector)
- 三种检测模式：`average` / `latest` / `slope`
- 可配置阈值和窗口大小
- 事件监听
- 自动通知/重置

### 压缩策略 (CompactStrategy)
- **MicroCompactStrategy**: 微压缩（合并消息、截断输出）
- **AutoCompactStrategy**: 自动压缩（结构化摘要）
- **ManualCompactStrategy**: 手动压缩（按类型/标签保留）

## 使用示例

### 基本使用

```typescript
import { ContextManager } from '@openclaw/suite-context-hub'

const manager = new ContextManager({
  maxTokens: 100000,
  autoCompactThreshold: 0.8,
})

// 添加事件
manager.add({
  type: 'message',
  id: '1',
  role: 'user',
  content: 'Hello!',
  timestamp: Date.now(),
})

// 获取上下文
const snapshot = await manager.getContext({ maxTokens: 50000 })
console.log(`Token 使用率: ${snapshot.usagePercent * 100}%`)

// 检查是否需要压缩
if (manager.shouldAutoCompact()) {
  await manager.compact('micro')
}
```

### 递减检测

```typescript
import { DiminishingReturnsDetector } from '@openclaw/suite-context-hub'

const detector = new DiminishingReturnsDetector({
  windowSize: 5,
  threshold: 500,
  stopThreshold: 0.1,
  tokenLimit: 100000,
  mode: 'average',
  autoNotify: true,
  onNotify: (msg) => console.warn(msg),
})

// 记录每次模型调用
detector.recordCall(3000)
detector.recordCall(1500)
detector.recordCall(800)

// 检查是否应该继续
const decision = detector.check()
if (!decision.shouldContinue) {
  console.log('检测到递减收益:', decision.message)
}

// 监听事件
detector.subscribe((event) => {
  if (event.type === 'stop') {
    console.log('Agent 应该停止')
  }
})
```

### 压缩策略

```typescript
import { createCompactStrategy } from '@openclaw/suite-context-hub'

// 微压缩
const micro = createCompactStrategy('micro', {
  maxOutputLength: 500,
})

// 自动压缩（保留 verify/test 工具调用）
const auto = createCompactStrategy('auto', {
  preservePatterns: ['*/verify', '*/test'],
})

// 手动压缩（只保留消息）
const manual = createCompactStrategy('manual', {
  preserveTypes: ['message'],
})
```

## API

### ContextManager
```typescript
const manager = new ContextManager({
  maxTokens: 100000,
  autoCompactThreshold: 0.8,
})

manager.add(event)                              // 添加事件
manager.getContext({ maxTokens: 50000 })       // 获取快照
manager.compact('micro')                       // 执行压缩
manager.shouldAutoCompact()                    // 是否需要压缩
manager.getStats()                            // 获取统计
```

### DiminishingReturnsDetector
```typescript
const detector = new DiminishingReturnsDetector({
  windowSize: 3,
  threshold: 500,
  stopThreshold: 0.1,
  mode: 'average',
})

detector.recordCall(3000)     // 记录调用
detector.check()             // 检查是否继续
detector.reset()             // 重置
detector.subscribe(handler)   // 监听事件
```

### 压缩策略
```typescript
createCompactStrategy('micro' | 'auto' | 'manual', options)
```
