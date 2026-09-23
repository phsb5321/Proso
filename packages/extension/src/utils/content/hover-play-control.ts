// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

import { HOVERABLE_CLASS, shouldIgnoreParagraphClick } from './hover-play';

/** One document-level control: host paragraph overflow cannot clip it. */
export function installHoverPlayControl(
  doc: Document,
  canOffer: () => boolean,
  play: (paragraph: Element) => void,
): () => void {
  let target: Element | null = null;
  let button: HTMLButtonElement | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  const activeClass = 'proso-hover-active';

  function hide(): void {
    clearTimeout(leaveTimer);
    target?.classList.remove(activeClass);
    target = null;
    if (button) button.hidden = true;
  }

  function valid(): boolean {
    return canOffer() && target?.isConnected === true && target.classList.contains(HOVERABLE_CLASS);
  }

  function refresh(): void {
    if (!valid()) hide();
  }

  function control(): HTMLButtonElement {
    if (button) return button;
    button = doc.createElement('button');
    button.className = 'proso-hover-play-icon';
    button.type = 'button';
    button.hidden = true;
    button.setAttribute('aria-label', 'Play from paragraph');
    button.title = 'Start playback from here';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!valid() || !target || shouldIgnoreParagraphClick(target, doc.getSelection())) {
        refresh();
        return;
      }
      play(target);
    });
    button.addEventListener('blur', hide);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        button?.blur();
        hide();
      }
    });
    doc.documentElement.append(button);
    return button;
  }

  doc.addEventListener('pointerover', (event) => {
    const node = event.target;
    if (!(node instanceof Element)) return;
    if (button?.contains(node)) {
      clearTimeout(leaveTimer);
      refresh();
      return;
    }
    const paragraph = node.closest(`.${HOVERABLE_CLASS}`);
    if (!canOffer() || shouldIgnoreParagraphClick(node, doc.getSelection())) {
      hide();
      return;
    }
    // Crossing the gutter dispatches pointerover on the page between the
    // paragraph and the control. Let pointerout's grace timer own that gap.
    if (!paragraph) return;
    clearTimeout(leaveTimer);
    // Keep the explicit picker if its control is already reachable. Opacity
    // animates on hover; hit-testing catches clipping without racing that fade.
    const existing = paragraph.querySelector('.proso-play-icon');
    if (existing) {
      const rect = existing.getBoundingClientRect();
      const hit = doc.elementFromPoint?.(rect.x + rect.width / 2, rect.y + rect.height / 2);
      if (rect.width > 0 && hit && (hit === existing || existing.contains(hit))) {
        hide();
        return;
      }
    }
    target?.classList.remove(activeClass);
    target = paragraph;
    target.classList.add(activeClass);
    const el = control();
    const rect = paragraph.getBoundingClientRect();
    const width = doc.documentElement.clientWidth;
    const height = doc.documentElement.clientHeight;
    // Prefer the outside gutter; clamp inside the viewport on narrow pages.
    el.style.setProperty(
      'left',
      `${Math.max(4, Math.min(rect.right + 4, width - 36))}px`,
      'important',
    );
    el.style.setProperty('top', `${Math.max(4, Math.min(rect.top, height - 36))}px`, 'important');
    el.hidden = false;
  });

  doc.addEventListener('pointerout', (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && (target?.contains(next) || button?.contains(next))) return;
    clearTimeout(leaveTimer);
    // Bridge the small gap to the gutter control without a flickering target.
    leaveTimer = setTimeout(() => {
      if (doc.activeElement !== button) hide();
    }, 150);
  });
  doc.addEventListener('scroll', hide, true);
  return refresh;
}
