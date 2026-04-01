# MCP Hub

> MCP 服务器集成中心

## 状态

✅ Phase 4 完成

## 功能

### MCP 服务器注册表 (MCPServerRegistry)
- 注册/注销服务器配置
- 启动/停止/重启服务器
- 自动重连
- 健康检查

### 连接管理器 (MCPConnectionManager)
- 服务器生命周期管理
- 心跳监控
- 自动重连

### 工具映射器 (MCPToolMapper)
- MCP 工具 → OpenClaw Tool 转换
- 批量映射（支持分页）
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

// 3. 获取工具
const tools = await registry.getTools('filesystem')

// 4. 工具映射到 OpenClaw
const mapper = new MCPToolMapper({
  namespacePrefix: 'mcp',
  includeServerName: true,
})

const mappedTools = await mapper.mapMany(tools, 'filesystem')
```

### 批量映射

```typescript
const result = await mapper.mapMany(mcpTools, 'github')

console.log(`成功: ${result.mappedCount}`)
console.log(`失败: ${result.failedCount}`)
if (result.errors.length > 0) {
  console.log('错误:', result.errors)
}
```

### 健康检查

```typescript
// 单个检查
const health = await registry.healthCheck('filesystem')
console.log(`服务器健康: ${health.healthy}`)
console.log(`延迟: ${health.latencyMs}ms`)

// 全部检查
const allHealth = await registry.healthCheckAll()
for (const [name, status] of allHealth) {
  console.log(`${name}: ${status.healthy ? '✅' : '❌'}`)
}
```

## API

### MCPServerRegistry
```typescript
const registry = new MCPServerRegistry({ autoConnect: true })

registry.register(config)              // 注册
registry.unregister(name)              // 注销
registry.start(name)                  // 启动
registry.stop(name)                   // 停止
registry.restart(name)                // 重启
registry.getTools(name)               // 获取工具
registry.healthCheck(name)           // 健康检查
```

### MCPToolMapper
```typescript
const mapper = new MCPToolMapper({
  namespacePrefix: 'mcp',
  includeServerName: true,
})

mapper.map(mcpTool, serverName)        // 单个映射
mapper.mapMany(mcpTools, serverName)  // 批量映射
```
