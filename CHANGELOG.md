# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-04-01

### Added

#### Core (`@openclaw/suite-core`)
- Shared type definitions for Tool, Permission, Context, MCP, Agent
- Task types: `Task`, `TaskStatus`, `TaskSubmission`, `TaskFilter`
- `ToolRegistry`, `IPermissionChecker`, `IRuleStore` interfaces
- `ToolCapabilities`, `PermissionContext`, `PermissionRule` types
- `AgentId`, `AgentMessage`, `Agent` types

#### ToolHub (`@openclaw/suite-tool-hub`)
- `DefaultToolRegistry`: Tool registration, search, lifecycle management
- `ToolExecutor`: Tool execution with timeout, retry, lifecycle hooks
- 6 built-in tools: filesystem (read/write/delete), network (http_request), code (execute), search
- `MemoryToolContextStore`, `PathResolver`, `ToolSearchEngine`

#### PermissionHub (`@openclaw/suite-permission-hub`)
- `RuleEngine`: Priority-based rule matching (10 priority levels)
- `MemoryRuleStore`, `FileRuleStore`, `RemoteRuleStore` with hot reload
- `PermissionChecker`: Pre-execution permission verification
- `PermissionGuard`: Tool-level permission protection wrapper
- Support for allow/deny/ask effects

#### ContextHub (`@openclaw/suite-context-hub`)
- `ContextManager`: Event-driven context tracking with snapshots
- `DiminishingReturnsDetector`: Detects diminishing returns in tool execution
- Three compaction strategies: `MicroCompactStrategy`, `AutoCompactStrategy`, `ManualCompactStrategy`
- `ToolContextAdapter` for ToolHub integration
- Event system: event_added, compact_start, compact_complete, threshold_reached

#### MCP Hub (`@openclaw/suite-mcp-hub`)
- `MCPServerRegistry`: MCP server configuration management
- `MCPConnectionManager`: Server lifecycle, heartbeat, auto-reconnect
- `MCPToolMapper`: MCP tool → OpenClaw Tool conversion (format: `mcp__server__tool`)
- Auto-sync to ToolHub: `syncServerTools()`, `removeToolsFromToolHub()`, `disableToolsInToolHub()`
- Batch mapping with progress callback and MapManyOptions support

#### CoordinatorHub (`@openclaw/suite-coordinator-hub`)
- `TaskManager`: Full task lifecycle (create/start/complete/fail/cancel/timeout)
- Parent-child task decomposition with `createSubtasks()`
- Three completion strategies: `all_success`, `any_success`, `manual`
- Retry mechanism: `scheduleRetry()` with linear/exponential backoff
- `PermissionAskHandler`: ask-effect permission confirmation flow
- `TaskStore` interface for pluggable storage (memory/Redis/database)
- Event system: subscribe/once/destroy

#### Integration Tests (`@openclaw/suite-integration-tests`)
- `toolhub-permission.test.ts`: ToolHub ↔ PermissionHub integration
- `toolhub-context.test.ts`: ToolHub ↔ ContextHub integration
- `mcphub-toolhub.test.ts`: MCPHub ↔ ToolHub integration
- `coordinator-permission.test.ts`: CoordinatorHub ↔ PermissionHub integration
- `e2e-scenario.test.ts`: End-to-end complete flow
- Standalone test: `tests/integration/full-scenario.test.ts`

### Fixed

- ToolRegistry import type/value issue
- PermissionChecker IRuleStore vs RuleStore naming
- DiminishingReturnsDetector config interface mismatch
- MCPServer tools type: Tool[] → MCPTool[]
- Core TaskStatus missing `waiting_approval` state
- Core Task missing timeout/maxRetries/retryCount fields
- RuleEngine defaultEffect double specification
- ContextManager readonly content mutation
- ContextManager timestamp access on union type
- ToolResultEvent missing timestamp field

### Documentation

- `docs/api-standards.md`: Complete API interface standards
- `packages/*/README.md`: Per-package documentation
- `tests/integration/README.md`: Test documentation

### Architecture

```
packages/
├── core/              # Shared types & interfaces
├── tool-hub/         # Tool registry & executor
├── permission-hub/    # Permission rule engine
├── context-hub/       # Context compression & detection
├── mcp-hub/          # MCP server integration
├── coordinator-hub/   # Multi-agent coordination
└── integration-tests/ # Integration tests
```
