/**
 * ContextHub - 上下文压缩引擎
 */

// Context Manager
export { ContextManager, type ContextManagerOptions } from './ContextManager.js'

// Tool Context Store
export { MemoryToolContextStore } from './MemoryToolContextStore.js'

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

// Integration
export {
  createToolContextAdapter,
  createSimpleToolMiddleware,
  type ToolContextAdapterOptions,
} from './integration/ToolContextAdapter.js'

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

// Errors
export {
  CONTEXT_ERROR_CODES,
  contextTokenLimit,
  contextCompactFailed,
  detectorConfigInvalid,
  eventTypeInvalid,
  eventPayloadTooLarge,
} from './errors.js'
