export { normalizeDocumentContent, NORMALIZATION_VERSION } from './document-normalizer';
export type { NormalizedSourceBlock, NormalizedSourceContent } from './document-normalizer';
export {
  createReadableDocument,
  deriveDocumentIdentity,
  documentPreimage,
  validateDocumentIdentity,
} from './document-identity';
export type { SourceDigest } from './document-identity';
export {
  repairSourceOffset,
  spokenOffsetToSource,
  spokenPlanKey,
  recoverSourceCheckpoint,
} from './source-position';
export type { SourceRecovery } from './source-position';
export { sourceIdentity, validateSourceBinding } from './source-binding';
