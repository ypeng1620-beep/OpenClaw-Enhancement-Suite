/**
 * PermissionHub - 权限规则引擎
 */

// Rule Engine
export { RuleEngine, type RuleEngineConfig } from './engine/RuleEngine.js'

// Permission Checker
export {
  PermissionChecker,
  type PermissionCheckerOptions,
} from './PermissionChecker.js'

// Permission Guard
export {
  PermissionGuard,
  type PermissionGuardOptions,
  createPermissionGuard,
  PermissionDeniedError,
} from './PermissionGuard.js'

// Rule Store
export {
  createRuleStore,
  MemoryRuleStore,
  FileRuleStore,
  RemoteRuleStore,
  type RuleStoreOptions,
} from './store/RuleStore.js'

// Re-export core types
export type {
  PermissionRule,
  PermissionRequest,
  PermissionDecision,
  PermissionSimulation,
  PermissionContext,
  SubjectMatcher,
  ObjectMatcher,
  ActionMatcher,
} from '@openclaw/suite-core'

// Errors
export {
  PERMISSION_ERROR_CODES,
  permissionDenied,
  ruleNotFound,
  ruleAlreadyExists,
  ruleValidationFailed,
  storeLoadFailed,
  storeSaveFailed,
  contextMissingField,
} from './errors.js'
