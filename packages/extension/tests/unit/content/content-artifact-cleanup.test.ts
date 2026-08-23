import { beforeEach, describe, expect, it } from '@jest/globals';
import { reconcileStaleContentArtifacts } from '../../../src/utils/content/content-artifact-cleanup';

describe('reconcileStaleContentArtifacts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
    for (const attribute of [...document.body.attributes]) {
      if (attribute.name.startsWith('data-proso-')) {
        document.body.removeAttribute(attribute.name);
      }
    }
  });

  it('removes only obsolete Proso playback DOM while preserving exact page text', () => {
    document.body.style.paddingBottom = '172px'; // author 12px + two legacy 80px footers
    document.body.innerHTML = `
      <main>
        <p class="article proso-highlight" data-proso-index="0">
          Olá <span class="proso-w proso-w--active"><span class="proso-w proso-w--glow">mundo</span></span>!
        </p>
        <div id="proso-sticky-footer"></div>
        <div id="proso-sticky-footer"></div>
        <div id="author-player">keep me</div>
      </main>
    `;
    const beforeText = document.querySelector('p')?.textContent;

    const receipt = reconcileStaleContentArtifacts(document);

    expect(receipt).toEqual({ footerRoots: 2, wordWrappers: 2, paragraphHighlights: 1 });
    expect(document.querySelectorAll('#proso-sticky-footer')).toHaveLength(0);
    expect(document.querySelectorAll('.proso-w')).toHaveLength(0);
    expect(document.querySelector('.proso-highlight')).toBeNull();
    expect(document.querySelector('[data-proso-index]')).toBeNull();
    expect(document.querySelector('p')?.textContent).toBe(beforeText);
    expect(document.getElementById('author-player')?.textContent).toBe('keep me');
    expect(document.body.style.paddingBottom).toBe('12px');
  });

  it('restores an exact marked author padding value and is idempotent', () => {
    document.body.style.paddingBottom = '96px';
    document.body.setAttribute('data-proso-footer-original-inline-padding', '1.5rem');
    document.body.setAttribute('data-proso-footer-original-computed-padding', '24');
    const root = document.createElement('div');
    root.id = 'proso-sticky-footer';
    document.body.appendChild(root);

    reconcileStaleContentArtifacts(document);
    const second = reconcileStaleContentArtifacts(document);

    expect(document.body.style.paddingBottom).toBe('1.5rem');
    expect(document.body.hasAttribute('data-proso-footer-original-inline-padding')).toBe(false);
    expect(second).toEqual({ footerRoots: 0, wordWrappers: 0, paragraphHighlights: 0 });
  });
});
