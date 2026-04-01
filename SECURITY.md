# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

如果你发现了安全漏洞，请：

1. **不要** 在 GitHub Issue 中公开披露
2. 发送邮件至项目维护者
3. 包含以下信息：
   - 问题描述
   - 复现步骤
   - 潜在影响
   - 建议的修复方案（可选）

我们会在 48 小时内确认收到报告，并在 7 天内提供初步反馈。

## 安全最佳实践

### 生产环境使用

- 使用 `RemoteRuleStore` 集中管理权限规则
- 危险工具默认 deny
- 网络访问工具使用 ask 效果确认
- MCP 服务器仅使用可信来源

### 权限规则

```json
{
  "effect": "deny",
  "conditions": {
    "subject": { "type": "*" },
    "object": { "toolId": "dangerous_tool" }
  }
}
```

## 更新日志

- 2026-04-01: v0.1.0 初始版本
