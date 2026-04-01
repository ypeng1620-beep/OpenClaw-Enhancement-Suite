# Context Hub

> 上下文压缩引擎

## 状态

🔨 设计中

## 职责

- 上下文事件管理
- 三层压缩系统 (micro/auto/manual)
- 递减收益检测
- Token 预算管理

## 接口依赖

- `ContextManager` - 上下文管理器
- `DiminishingReturnsDetector` - 递减检测器
