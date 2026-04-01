# Integration Guide - OpenClaw Enhancement Suite

## 本地集成（npm link）

### 步骤 1: 构建包

```bash
cd D:\OpenClaw-Enhancement-Suite
pnpm run build
```

### 步骤 2: 创建全局链接

```bash
# 链接各包到全局
cd packages/core && npm link && cd ../..
cd packages/tool-hub && npm link && cd ../..
cd packages/permission-hub && npm link && cd ../..
cd packages/context-hub && npm link && cd ../..
cd packages/mcp-hub && npm link && cd ../..
cd packages/coordinator-hub && npm link && cd ../..
```

### 步骤 3: 在目标项目中使用

```bash
# 在 OpenClaw workspace 或其他项目
npm link @openclaw/suite-core
npm link @openclaw/suite-tool-hub
npm link @openclaw/suite-permission-hub
npm link @openclaw/suite-context-hub
npm link @openclaw/suite-mcp-hub
npm link @openclaw/suite-coordinator-hub
```

### 步骤 4: 验证集成

```typescript
// 在你的项目中
import { createSuiteIntegration } from '@openclaw/suite-integration'

const suite = await createSuiteIntegration()
console.log('Suite 初始化成功')
console.log('工具数:', (await suite.toolHub.list()).length)
suite.destroy()
```

## OpenClaw 技能集成

在 OpenClaw 技能中使用 suite：

```typescript
// your-skill/index.ts
import { createSuiteIntegration } from '@openclaw/suite-integration'

// 初始化（推荐在技能加载时执行一次）
let suite: Awaited<ReturnType<typeof createSuiteIntegration>>

export async function init() {
  suite = await createSuiteIntegration({
    mcpHub: true,
    coordinatorHub: true,
  })

  // 注册 MCP 服务器
  await suite.mcpHub.registry.register({
    name: 'my-server',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
  })
}

export async function onMessage(message: string) {
  // 创建任务
  const task = await suite.coordinatorHub.createTask({
    description: '处理消息',
    type: 'general',
  })

  // 执行
  await suite.coordinatorHub.startTask(task.id)

  // ... 处理完成后
  await suite.coordinatorHub.completeTask(task.id, { result: 'done' })

  return '处理完成'
}
```

## OpenClaw Agent 集成

在自定义 Agent 中使用 suite：

```typescript
// agent.ts
import { createSuiteIntegration } from '@openclaw/suite-integration'

const suite = await createSuiteIntegration({
  toolHub: true,
  permissionHub: true,
  contextHub: true,
  maxContextEvents: 500,
  maxConcurrentTasks: 5,
})

// 注册自定义工具
await suite.toolHub.register({
  id: 'my_analysis',
  name: 'analyze',
  namespace: 'analysis',
  version: '1.0.0',
  description: '分析数据',
  inputSchema: { type: 'object' },
  execute: async (input) => {
    // 分析逻辑
    return { result: 'analysis complete' }
  },
})

// 添加权限规则
await suite.permissionHub.engine.getStore().addRule({
  id: 'allow-analysis',
  effect: 'allow',
  priority: 10,
  conditions: {
    subject: { type: 'agent', agentId: 'my-agent' },
    object: { type: 'namespace', namespace: 'analysis' },
  },
})

// 监听递减检测
suite.contextHub.on('threshold_reached', () => {
  console.log('上下文达到阈值，建议压缩')
})

suite.destroy()
```

## OpenClaw MCP 服务器扩展

创建自定义 MCP 服务器扩展：

```typescript
// mcp-server-extension/index.ts
import { MCPServerRegistry, MCPToolMapper } from '@openclaw/suite-mcp-hub'
import { ToolRegistry } from '@openclaw/suite-tool-hub'

export default {
  name: 'my-mcp-extension',

  async onLoad() {
    const registry = new ToolRegistry()
    const mapper = new MCPToolMapper()
    const mcpRegistry = new MCPServerRegistry({
      syncToToolHub: registry,
      toolMapper: mapper,
    })

    // 注册 MCP 服务器
    await mcpRegistry.register({
      name: 'custom-mcp',
      type: 'stdio',
      command: 'node',
      args: ['./mcp-server.js'],
    })

    console.log('MCP 扩展加载完成')
  },
}
```

## 包版本信息

| 包 | 版本 | 说明 |
|----|------|------|
| `@openclaw/suite-core` | 0.1.0 | 共享类型 |
| `@openclaw/suite-tool-hub` | 0.1.0 | 工具注册 |
| `@openclaw/suite-permission-hub` | 0.1.0 | 权限引擎 |
| `@openclaw/suite-context-hub` | 0.1.0 | 上下文压缩 |
| `@openclaw/suite-mcp-hub` | 0.1.0 | MCP 集成 |
| `@openclaw/suite-coordinator-hub` | 0.1.0 | 任务协调 |
| `@openclaw/suite-integration` | 0.1.0 | 统一入口 |

## 卸载链接

```bash
# 在目标项目
npm unlink @openclaw/suite-core @openclaw/suite-tool-hub ...

# 在 suite 目录
cd packages/core && npm unlink
# ... 其他包重复
```
