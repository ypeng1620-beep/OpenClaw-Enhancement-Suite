# CoordinatorHub

> 多 Agent 协调中心

## 状态

✅ Phase 5 完成（含重试机制、父子策略、超时清理、ask 集成）

## 核心功能

### TaskManager
- **任务生命周期**：create → start → complete/fail/cancel/timeout
- **重试机制**：自动重试（指数退避）、手动 retryTask
- **父子任务策略**：`all_success` | `any_success` | `manual`
- **超时自动清理**：超时后向下传播取消子任务
- **ask 效果集成**：`setWaitingApproval` / `resolveApproval`
- **事件系统**：`subscribe` / `once` / `destroy`
- **可替换存储**：`TaskStore` 接口（默认内存）

### PermissionAskHandler
- `requestConfirmation` → Promise<boolean>
- `createPermissionCheckerWrapper` 包装权限检查器

## 父子任务策略

```typescript
// all_success（默认）：全部子任务成功父任务才成功；任一失败父任务失败
const manager = new TaskManager({ parentCompletionStrategy: 'all_success' })

// any_success：任一子任务成功父任务即成功；全部失败父任务才失败
const manager = new TaskManager({ parentCompletionStrategy: 'any_success' })

// manual：调用方显式决定父任务状态
const manager = new TaskManager({ parentCompletionStrategy: 'manual' })
```

## 使用示例

### 基本用法

```typescript
const manager = new TaskManager({
  defaultTimeout: 300000,
  maxConcurrentTasks: 10,
  parentCompletionStrategy: 'all_success',
  defaultMaxRetries: 3,
  defaultRetryDelay: 5000,
})

// 订阅事件
manager.subscribe('completed', (e) => {
  if (e.type === 'completed') console.log(`任务完成: ${e.taskId}`)
})

// 创建并启动
const task = await manager.createTask({
  description: '分析股票',
  prompt: '分析贵州茅台',
  type: 'research',
})

await manager.startTask(task.id)
await manager.updateProgress(task.id, 50, '正在分析...')
await manager.completeTask(task.id, { analysis: '...' })
```

### 重试机制

```typescript
// 自动重试（失败时自动调度）
await manager.scheduleRetry(task.id, {
  maxRetries: 3,
  retryDelay: 5000,
  backoff: 'exponential',  // 线性或指数
  maxDelay: 60000,
})

// 手动重试（重新执行）
await manager.retryTask(taskId)
```

### 父子任务

```typescript
const parent = await manager.createTask({
  description: '全面分析',
  prompt: '',
})

const [sub1, sub2] = await manager.createSubtasks(parent.id, [
  { description: '财务', prompt: '' },
  { description: '市场', prompt: '' },
])

// 所有子任务完成后，父任务自动完成
```

### ask 效果集成（权限确认）

```typescript
// 权限检查返回 ask 时，暂停任务等待用户确认
const approved = await manager.setWaitingApproval(
  taskId,
  askHandler.requestConfirmation(request, reason)
)

// 外部（如消息通道）调用：
manager.resolveApproval(taskId, true)  // 允许
manager.rejectApproval(taskId, '用户拒绝')  // 拒绝
```

## API

### TaskManager

```typescript
// 创建/查询
createTask(submission, retryOpts?)    // 创建任务
createSubtasks(parentId, submissions)  // 批量创建子任务
getTask(taskId)                        // 获取任务
listTasks(filter?)                    // 列出任务

// 生命周期
startTask(taskId)                     // 启动
completeTask(taskId, result)          // 完成
failTask(taskId, error, strategy?)    // 失败（可指定策略）
cancelTask(taskId)                   // 取消
deleteTask(taskId)                   // 删除

// 重试
scheduleRetry(taskId, options?)       // 自动重试调度
retryTask(taskId)                    // 手动重试

// ask 效果
setWaitingApproval(taskId, promise)   // 暂停等待确认
resolveApproval(taskId, approved)    // 解析确认
rejectApproval(taskId, reason)       // 拒绝确认

// 分配
assignTask(taskId, agentId)          // 分配给 Agent

// 事件
subscribe(eventType, handler)        // 订阅事件
once(eventType, handler)             // 一次性订阅

// 生命周期
destroy()                           // 销毁，清理所有资源
```

### TaskStore 接口

```typescript
interface TaskStore {
  save(task: Task): Promise<void>
  get(taskId: string): Promise<Task | undefined>
  query(filter?: TaskFilter): Promise<Task[]>
  updateStatus(taskId: string, status: TaskStatus): Promise<void>
  updateField<K extends keyof Task>(taskId: string, field: K, value: Task[K]): Promise<void>
  delete(taskId: string): Promise<void>
}
```

### 事件类型

```typescript
'created' | 'started' | 'progress' | 'completed' | 'failed'
| 'cancelled' | 'timeout' | 'deleted' | 'retry_scheduled'
| 'retry_executed' | 'waiting_approval' | 'approval_resolved'
```
