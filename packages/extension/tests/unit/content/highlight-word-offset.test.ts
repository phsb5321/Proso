import { afterEach, describe, expect, it } from '@jest/globals';
import { HighlightManager } from '../../../src/utils/content/highlight';

describe('HighlightManager word offsets', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('wraps the occurrence identified by an absolute paragraph offset', () => {
    const text = 'Repeat first sentence. Repeat second sentence.';
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    paragraph.scrollIntoView = () => {};
    document.body.appendChild(paragraph);

    const manager = new HighlightManager();
    manager.highlightParagraph(0, text, undefined, [paragraph]);
    manager.setWordTimeline(
      [
        {
          word: 'Repeat',
          charOffset: text.lastIndexOf('Repeat'),
          charLength: 'Repeat'.length,
          startTimeMs: 1000,
          endTimeMs: 1500,
        },
      ],
      0,
    );

    expect(paragraph.innerHTML).toContain(
      'Repeat first sentence. <span class="proso-w" data-wi="0">Repeat</span> second sentence.',
    );
  });

  it('falls back to sequential matching when provider normalization shifts an offset', () => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Provider normalization shifted this word.';
    paragraph.scrollIntoView = () => {};
    document.body.appendChild(paragraph);

    const manager = new HighlightManager();
    manager.highlightParagraph(0, paragraph.textContent, undefined, [paragraph]);
    manager.setWordTimeline(
      [
        {
          word: 'shifted',
          charOffset: 999,
          charLength: 'shifted'.length,
          startTimeMs: 0,
          endTimeMs: 500,
        },
      ],
      0,
    );

    expect(paragraph.querySelector('.proso-w')?.textContent).toBe('shifted');
  });
});
