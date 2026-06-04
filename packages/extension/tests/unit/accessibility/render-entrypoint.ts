// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Test helper: render a static entrypoint HTML fixture into the live jsdom
 * document so axe-core and keyboard tests can operate on a realistic DOM.
 *
 * Shared by the User Story 6 accessibility tests (T076-T078). The input is
 * always the project's own checked-in entrypoint markup; `<script>`, `<link>`
 * and `<style>` elements are stripped so nothing executes or fetches during a
 * static accessibility scan.
 *
 * @module tests/unit/accessibility/render-entrypoint
 */

/**
 * Extract the inner markup of the `<body>` from a full HTML document string,
 * with scripts/links/styles removed. Falls back to the whole string if no
 * `<body>` is present (already a fragment).
 */
export function loadEntrypointBody(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
}

/**
 * Parse a markup fragment with {@link DOMParser} (inert — no script execution,
 * no resource fetches) and mount its body children onto the live
 * `document.body`. Returns a cleanup function that removes the mounted nodes.
 */
export function renderFragment(markup: string): () => void {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<body>${markup}</body>`, 'text/html');

  const mounted: ChildNode[] = [];
  for (const node of Array.from(parsed.body.childNodes)) {
    const imported = document.importNode(node, true);
    document.body.appendChild(imported);
    mounted.push(imported);
  }

  return () => {
    for (const node of mounted) {
      node.remove();
    }
  };
}
