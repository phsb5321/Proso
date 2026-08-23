const FOOTER_ROOT_ID = 'proso-sticky-footer';
const ORIGINAL_INLINE_PADDING_ATTRIBUTE = 'data-proso-footer-original-inline-padding';
const ORIGINAL_COMPUTED_PADDING_ATTRIBUTE = 'data-proso-footer-original-computed-padding';
const LEGACY_FOOTER_OFFSET_PX = 80;

export interface ContentArtifactCleanupReceipt {
  readonly footerRoots: number;
  readonly wordWrappers: number;
  readonly paragraphHighlights: number;
}

function parsePixels(value: string | null): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)px$/u);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function restoreProsoFooterPadding(documentRef: Document): void {
  const body = documentRef.body;
  if (!body) return;

  if (body.hasAttribute(ORIGINAL_INLINE_PADDING_ATTRIBUTE)) {
    body.style.paddingBottom = body.getAttribute(ORIGINAL_INLINE_PADDING_ATTRIBUTE) ?? '';
    body.removeAttribute(ORIGINAL_INLINE_PADDING_ATTRIBUTE);
    body.removeAttribute(ORIGINAL_COMPUTED_PADDING_ATTRIBUTE);
  }
}

export function applyProsoFooterPadding(documentRef: Document, footerHeightPx: number): void {
  const body = documentRef.body;
  if (!body) return;

  if (!body.hasAttribute(ORIGINAL_INLINE_PADDING_ATTRIBUTE)) {
    body.setAttribute(ORIGINAL_INLINE_PADDING_ATTRIBUTE, body.style.paddingBottom);
    const computed = documentRef.defaultView?.getComputedStyle(body).paddingBottom ?? '0px';
    body.setAttribute(
      ORIGINAL_COMPUTED_PADDING_ATTRIBUTE,
      String(Math.max(0, Number.parseFloat(computed) || 0)),
    );
  }

  const originalComputed = Number(body.getAttribute(ORIGINAL_COMPUTED_PADDING_ATTRIBUTE) ?? '0');
  body.style.paddingBottom = `${Math.max(0, originalComputed) + footerHeightPx + 16}px`;
}

export function reconcileStaleFooterArtifacts(documentRef: Document): number {
  const body = documentRef.body;
  if (!body) return 0;

  const footerRoots = Array.from(documentRef.querySelectorAll<HTMLElement>(`#${FOOTER_ROOT_ID}`));
  if (body.hasAttribute(ORIGINAL_INLINE_PADDING_ATTRIBUTE)) {
    restoreProsoFooterPadding(documentRef);
  } else if (footerRoots.length > 0) {
    // ponytail: pre-marker builds only wrote pixel padding and added 80 px per
    // full footer. Subtract that known legacy contribution; a non-pixel author
    // value is left untouched rather than guessed.
    const inlinePixels = parsePixels(body.style.paddingBottom);
    if (inlinePixels !== null) {
      body.style.paddingBottom = `${Math.max(
        0,
        inlinePixels - footerRoots.length * LEGACY_FOOTER_OFFSET_PX,
      )}px`;
    }
  }
  for (const root of footerRoots) root.remove();
  return footerRoots.length;
}

/**
 * Remove playback DOM left by a content-script world that no longer exists.
 * Only Proso-prefixed roots/classes are touched; text nodes are moved out of
 * wrappers unchanged.
 */
export function reconcileStaleContentArtifacts(
  documentRef: Document,
): ContentArtifactCleanupReceipt {
  if (!documentRef.body) {
    return { footerRoots: 0, wordWrappers: 0, paragraphHighlights: 0 };
  }

  const footerRoots = reconcileStaleFooterArtifacts(documentRef);
  const wrappers = Array.from(documentRef.querySelectorAll<HTMLElement>('.proso-w'));
  const parentsToNormalize = new Set<Node>();
  for (const wrapper of wrappers) {
    const parent = wrapper.parentNode;
    if (!parent) continue;
    parentsToNormalize.add(parent);
    wrapper.replaceWith(...Array.from(wrapper.childNodes));
  }
  for (const parent of parentsToNormalize) {
    if (parent.isConnected) parent.normalize();
  }

  const paragraphHighlights = Array.from(
    documentRef.querySelectorAll<HTMLElement>('.proso-highlight, [data-proso-index]'),
  );
  for (const element of paragraphHighlights) {
    element.classList.remove('proso-highlight');
    element.removeAttribute('data-proso-index');
  }

  return {
    footerRoots,
    wordWrappers: wrappers.length,
    paragraphHighlights: new Set(paragraphHighlights).size,
  };
}
