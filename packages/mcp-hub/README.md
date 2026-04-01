# MCP Hub

> MCP 服务器集成中心

## 状态

✅ Phase 4 完成（含微调）

## 功能

### MCP 服务器注册表 (MCPServerRegistry)
- 注册/注销服务器配置
- 启动/停止/重启服务器
- **自动同步到 ToolHub**
- 断开时自动禁用/移除工具
- 健康检查

### 连接管理器 (MCPConnectionManager)
- 服务器生命周期管理
- 心跳监控
- 自动重连

### 工具映射器 (MCPToolMapper)
- MCP 工具 → OpenClaw Tool 转换
- **批量映射（支持分批 + 进度回调）**
- 自定义元数据

## 使用示例

### 基本使用

```typescript
import {
  MCPServerRegistry,
  MCPToolMapper,
  MCPServerConfig,
} from '@openclaw/suite-mcp-hub'

// 1. 创建注册表
const registry = new MCPServerRegistry({
  autoConnect: true,
})

// 2. 注册 MCP 服务器
const config: MCPServerConfig = {
  name: 'filesystem',
  type: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
}

await registry.register(config)

// 3. 工具自动同步到 ToolHub
const tools = await registry.syncServerTools('filesystem')
```

### 自动同步到 ToolHub

```typescript
// 创建时绑定 ToolHub
const registry = new MCPServerRegistry({
  syncToToolHub: toolRegistry,  // 绑定 ToolHub
})

// 注册服务器时自动同步
await registry.register(config)
// → 工具自动注册到 ToolHub

// 断开时自动禁用工具
await registry.stop('filesystem')
// → 工具自动在 ToolHub 中标记为不可用
```

### 批量映射（带进度）

```typescript
const result = await mapper.mapMany(mcpTools, 'github', {
  batchSize: 30,
  parallel: true,
  onProgress: (completed, total) => {
    console.log(`映射进度: ${completed}/${total}`)
  },
})

console.log(`成功: ${result.mappedCount}`)
console.log(`失败: ${result.failedCount}`)
```

## API

### MCPServerRegistry
```typescript
const registry = new MCPServerRegistry({
  syncToToolHub: toolRegistry,  // 可选：绑定 ToolHub
})

registry.register(config)              // 注册
registry.unregister(name)              // 注销（从 ToolHub 移除工具）
registry.start(name)                  // 启动（同步工具到 ToolHub）
registry.stop(name)                   // 停止（禁用 ToolHub 中的工具）
registry.restart(name)               // 重启
registry.syncServerTools(name)        // 手动同步工具
registry.syncAllToolsToToolHub()     // 同步所有工具
registry.healthCheck(name)           // 健康检查
```

### MCPToolMapper
```typescript
const mapper = new MCPToolMapper({
  namespacePrefix: 'mcp',
  includeServerName: true,
})

mapper.map(mcpTool, serverName)        // 单个映射
mapper.mapMany(mcpTools, serverName, { // 批量映射（带分批）
  batchSize: 50,
  parallel: true,
  onProgress: (done, total) => {},
})
```
