/**
 * ContextHub - 上下文压缩引擎
 */

// Context Manager
export { ContextManager, type ContextManagerOptions } from './ContextManager.js'

// Diminishing Returns Detector
export {
  DiminishingReturnsDetector,
  createDetector,
  type DetectorOptions,
  type DetectorEvent,
} from './detector/DiminishingReturnsDetector.js'

// Compact Strategies
export {
  createCompactStrategy,
  type CompactStrategy,
  MicroCompactStrategy,
  AutoCompactStrategy,
  ManualCompactStrategy,
} from './compact/strategies.js'

// Re-export core types
export type {
  ContextEvent,
  MessageEvent,
  ToolCallEvent,
  ToolResultEvent,
  MemoryEvent,
  CompactEvent,
  ContextSnapshot,
  CompactResult,
  ContextStats,
  DiminishingReturnsConfig,
  DiminishingReturnsDecision,
} from '@openclaw/suite-core'
