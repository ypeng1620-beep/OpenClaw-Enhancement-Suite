# CoordinatorHub

> 多 Agent 协调中心

## 状态

✅ Phase 5 完成

## 功能

### 任务管理器 (TaskManager)
- 任务创建、状态跟踪
- 父子任务关系
- 超时控制
- 事件监听

### 权限确认处理器 (PermissionAskHandler)
- 处理 ask 效果的权限请求
- 用户确认对话框
- 超时控制

## 使用示例

### 基本使用

```typescript
import { TaskManager } from '@openclaw/suite-coordinator-hub'

const taskManager = new TaskManager({
  defaultTimeout: 300000, // 5 分钟
  maxConcurrentTasks: 10,
})

// 创建任务
const task = await taskManager.createTask({
  description: '分析股票',
  prompt: '请分析贵州茅台的股价',
  type: 'research',
})

// 监听任务事件
taskManager.subscribe((event) => {
  if (event.type === 'completed') {
    console.log(`任务 ${event.taskId} 完成`)
  }
})

// 完成任务
await taskManager.completeTask(task.id, { analysis: '...' })
```

### 任务分解

```typescript
// 父任务分解为子任务
const parentTask = await taskManager.createTask({
  description: '完成项目分析',
  prompt: '全面分析这个项目',
  type: 'general',
})

const subtasks = await taskManager.createSubtasks(parentTask.id, [
  {
    description: '技术分析',
    prompt: '分析技术栈',
    type: 'research',
  },
  {
    description: '市场分析',
    prompt: '分析市场规模',
    type: 'research',
  },
])

// 子任务全部完成后，父任务自动完成
```

### 权限确认

```typescript
import { PermissionAskHandler } from '@openclaw/suite-coordinator-hub'

const askHandler = new PermissionAskHandler({
  defaultTimeout: 60000,
  onAsk: async (request) => {
    // 显示确认对话框
    const message = formatConfirmationMessage(request.request, request.reason)
    return await showConfirmDialog(message)
  },
  onTimeout: (request) => {
    console.log(`权限请求 ${request.id} 超时`)
  },
})

// 包装权限检查器
const wrappedChecker = askHandler.createPermissionCheckerWrapper(originalChecker)
```

## API

### TaskManager
```typescript
const manager = new TaskManager({
  defaultTimeout: 300000,
  maxConcurrentTasks: 10,
})

manager.createTask(submission)       // 创建任务
manager.getTask(taskId)           // 获取任务
manager.listTasks(filter)         // 列出任务
manager.startTask(taskId)         // 开始任务
manager.completeTask(taskId, result)  // 完成任务
manager.failTask(taskId, error)   // 标记失败
manager.cancelTask(taskId)        // 取消任务
manager.createSubtasks(parentId, submissions)  // 创建子任务
manager.subscribe(handler)         // 监听事件
```

### PermissionAskHandler
```typescript
const handler = new PermissionAskHandler({
  onAsk: async (request) => showConfirmDialog(...),
  onTimeout: (request) => log(...),
})

handler.requestConfirmation(request, reason)  // 请求确认
handler.resolveRequest(id, confirmed)      // 解析确认
```
