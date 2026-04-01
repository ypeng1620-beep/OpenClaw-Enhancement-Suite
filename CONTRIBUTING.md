# Contributing to OpenClaw Enhancement Suite

感谢你愿意为这个项目贡献代码！请先阅读以下指南。

## 开发环境

### 前置要求

- Node.js >= 20.0.0
- pnpm >= 10.0.0
- Git

### 初始化

```bash
git clone https://github.com/ypeng1620-beep/OpenClaw-Enhancement-Suite.git
cd OpenClaw-Enhancement-Suite
pnpm install
pnpm run build
```

### 开发命令

```bash
pnpm run build      # 构建所有包
pnpm run test       # 运行集成测试
pnpm run clean      # 清理构建产物
```

## 分支管理

- `main` - 主分支，稳定版本
- 功能开发请创建新分支：`git checkout -b feature/your-feature`
- 修复请创建：`git checkout -b fix/your-fix`

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: add new tool registry feature
fix: resolve MCP server timeout issue
docs: update API reference
refactor: simplify permission engine
test: add integration test for task manager
```

## Pull Request 流程

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 编写代码，确保所有测试通过
4. 提交：`git commit -m "feat: add amazing feature"`
5. 推送：`git push origin feature/amazing-feature`
6. 打开 Pull Request

## 代码风格

- TypeScript strict mode
- 使用 pnpm 管理依赖
- 所有导出需要有 JSDoc 注释
- 文件末尾留一个空行

## 包结构

每个包位于 `packages/` 目录下：

```
packages/
├── core/           # 共享类型
├── tool-hub/       # 工具注册表
├── permission-hub/ # 权限引擎
├── context-hub/    # 上下文压缩
├── mcp-hub/        # MCP 集成
└── coordinator-hub/# 任务协调
```

## 测试指南

- 每个包有自己的 `__tests__/` 目录
- 集成测试位于 `tests/integration/`
- 运行：`npx tsx tests/integration/full-scenario.test.ts`

## 文档规范

- API 文档使用 JSDoc
- 用户文档放在 `docs/`
- 每个包需要有 `README.md`

## Issue 规范

提交 Issue 时请包含：

- 问题描述（用中文或英文）
- 复现步骤
- 预期行为 vs 实际行为
- 环境信息（Node 版本、操作系统等）
- 日志或截图（如有）

## 许可证

提交代码即表示你同意你的代码使用 MIT 许可证。
