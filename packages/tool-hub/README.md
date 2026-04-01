# ToolHub

> 工具注册与管理中心

## 状态

✅ Phase 1 实现中

## 功能

### 工具注册表 (ToolRegistry)
- 注册/注销工具
- 按命名空间、来源、标签、能力的过滤器
- 关键词搜索
- 工具启用/禁用

### 工具执行器 (ToolExecutor)
- 完整生命周期钩子（beforeExecute / afterExecute / onError）
- 执行超时控制
- 全局钩子注入

### 内置工具 (Built-in)
- **文件系统**: `filesystem/read`, `filesystem/write`, `filesystem/list`, `filesystem/info`
- **网络请求**: `network/http_get`, `network/http_post`

### 搜索 (SearchEngine)
- 关键词匹配
- 同义词扩展
- 模糊匹配
- 多字段评分

## 使用示例

```typescript
import {
  DefaultToolRegistry,
  getAllBuiltinTools,
  createTool,
} from '@openclaw/suite-tool-hub'
import { createPermissionContext } from '@openclaw/suite-core'

async function main() {
  // 1. 创建注册表
  const registry = new DefaultToolRegistry({
    defaultTimeoutMs: 30000,
  })

  // 2. 注册内置工具
  await registry.registerMany(getAllBuiltinTools())

  // 3. 注册自定义工具
  await registry.register(myCustomTool)

  // 4. 搜索工具
  const results = await registry.search({
    query: 'read file',
    limit: 5,
  })

  // 5. 执行工具
  const ctx = createPermissionContext('session-1', 'user-1')
  const result = await registry.execute('filesystem/read', {
    path: '/path/to/file.txt',
  }, ctx)
}
```

## API

### ToolRegistry
```typescript
class DefaultToolRegistry implements ToolRegistry {
  register(tool: Tool): Promise<void>
  unregister(toolId: string): Promise<void>
  get(toolId: string): Promise<Tool | undefined>
  list(filter?: ToolFilter): Promise<Tool[]>
  search(query: ToolSearchQuery): Promise<ToolSearchResult[]>
  execute(toolId: string, input: unknown, ctx: ToolContext): Promise<ToolResult>
}
```

### ToolExecutor
```typescript
const executor = new ToolExecutor({
  defaultTimeoutMs: 30000,
  enableHooks: true,
  beforeExecute: async (input, ctx) => {
    // 记录日志
    return { input }
  },
  onError: async (input, ctx, error) => {
    // 上报错误
  },
})
```

## 内置工具列表

| ID | 名称 | 描述 | 能力 |
|---|---|---|---|
| `filesystem/read` | Read File | 读取文件 | 只读、文件系统 |
| `filesystem/write` | Write File | 写入文件 | 可写、文件系统、危险 |
| `filesystem/list` | List Directory | 列目录 | 只读、文件系统 |
| `filesystem/info` | File Info | 获取文件信息 | 只读、文件系统 |
| `network/http_get` | HTTP GET | GET 请求 | 只读、网络 |
| `network/http_post` | HTTP POST | POST 请求 | 可写、网络 |
