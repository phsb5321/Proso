/** Feature 252's four public contracts. Queue state and credentials live elsewhere. */
export interface SourceRef {
  readonly provider: 'miniflux';
  readonly connectionId: string;
  readonly itemId: string;
  readonly canonicalUrl: string;
}

export interface ReadableDocument {
  readonly source: SourceRef;
  readonly title: string;
  readonly author: string | null;
  readonly language: string | null;
  readonly revision: string;
  readonly blocks: readonly Block[];
  readonly coverage: DocumentCoverage;
  readonly fetchedAt: number;
}

export interface Block {
  readonly id: string;
  readonly kind: 'paragraph' | 'heading' | 'list';
  readonly originalText: string;
  readonly sourceAnchor?: string;
  readonly parentId?: string;
}

export interface Checkpoint {
  readonly documentRevision: string;
  readonly blockId: string;
  readonly sourceOffset: number;
  readonly audioOffsetMs: number;
}

export interface DocumentCoverage {
  readonly status: 'full' | 'partial' | 'unknown';
  readonly reasons: readonly string[];
}
