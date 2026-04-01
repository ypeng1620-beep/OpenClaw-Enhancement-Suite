# Architecture Decisions

## 上下文压缩算法选型

### 问题背景

AI Agent 在长对话中会积累大量上下文事件，导致：
- Token 费用增加
- 模型推理变慢
- 关键信息被稀释

### 压缩策略对比

| 策略 | 原理 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|---------|
| **Micro** | 合并连续消息 + 截断长输出 | 轻量、快速 | 可能丢失细节 | 日常对话 |
| **Auto** | 生成结构化摘要 + 保留关键决策 | 智能、保留重点 | 需要 LLM 调用 | 研究任务 |
| **Manual** | 用户指定保留内容 | 完全控制 | 需要人工介入 | 关键任务 |

### MicroCompactStrategy 算法

```
输入: [e1, e2, e3, ...]
1. 遍历事件列表
2. 如果是连续同角色消息 → 合并 content
3. 如果是 tool_result 且长度 > maxOutputLength → 截断
4. 返回压缩后列表
```

时间复杂度: **O(n)**
空间复杂度: **O(n)**

### 递减检测算法

```
DiminishingReturnsDetector:
1. 维护滑动窗口 (windowSize=10)
2. 每次 tool_result 记录 outputSize
3. 比较前半窗口 vs 后半窗口均值
4. 如果 (avg_first - avg_second) / avg_first > threshold (15%)
   → 触发递减通知
5. 进入冷静期 (cooldown) 后重置
```

### 性能对比

| 策略 | Token 节省 | 延迟增加 | 信息保留率 |
|------|-----------|---------|----------|
| 无压缩 | 0% | 0ms | 100% |
| Micro | 30-50% | 1-2ms | 85% |
| Auto | 60-80% | 50-200ms | 70% |

## 多 Agent 协调设计

### 任务状态机

```
pending → running → completed
              ↓
           failed
              ↓
           timeout
              ↓
         waiting_approval (ask 效果时)
```

### 父子任务完成策略

#### all_success（默认）
```
所有子任务完成时:
- 全部成功 → 父任务成功，结果 = [子任务结果数组]
- 任一失败 → 父任务失败
```

#### any_success
```
所有子任务完成时:
- 任一成功 → 父任务成功
- 全部失败 → 父任务失败
```

#### manual
```
父任务状态由调用方显式决定
不自动传播子任务结果
```

### 分布式场景考量

当前版本为单进程设计。分布式场景（多机器、多 Agent）需要：

1. **任务存储**: Redis 或数据库替代 MemoryTaskStore
2. **事件广播**: 使用消息队列（Kafka/RabbitMQ）
3. **分布式锁**: 防止重复任务执行
4. **结果聚合**: 父任务在不同机器上监听子任务完成事件

### 重试机制

```
scheduleRetry():
- 支持线性退避 (delay * attempt)
- 支持指数退避 (delay * 2^attempt)
- 最大延迟上限 (maxDelay)
- 超出 maxRetries 后标记失败
```

## 权限引擎设计

### 规则匹配优先级

```
高优先级 (100)  ←── 显式 deny
     ↓
     ↓
低优先级 (1)   ←── 兜底 allow
```

### 匹配流程

```
请求进来 → 按优先级排序规则 → 逐个匹配
→ 第一个匹配决定结果
→ 无匹配 → deny
```

### 三种效果

| 效果 | 行为 |
|------|------|
| `allow` | 直接执行 |
| `deny` | 阻止执行，返回错误 |
| `ask` | 暂停等待用户确认 |

## MCP 工具映射

### ID 格式

```
{mcp}__{serverName}__{toolName}
例: mcp__filesystem__read_file
```

### 工具能力映射

| MCP 能力 | OpenClaw 默认 |
|---------|--------------|
| 读文件 | readOnly=true |
| 写文件 | readOnly=false |
| 网络调用 | networkAccess=true |
| 危险操作 | dangerous=true |

## 版本兼容性

| 包版本 | OpenClaw 版本 | Node.js |
|--------|--------------|---------|
| 0.1.0 | v2.x | >= 20.0.0 |

未来计划：
- 1.0.0: OpenClaw v3.x 兼容
- 支持 Deno 运行时
- 支持浏览器环境
