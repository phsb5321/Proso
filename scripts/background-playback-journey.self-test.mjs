import assert from 'node:assert/strict';
import {
  advancing,
  crossedParagraph,
  hiddenThroughout,
  stopped,
} from './background-playback-journey.mjs';
import { Driver } from './lib/webdriver.mjs';

const playing = {
  id: 0,
  paused: false,
  ended: false,
  error: null,
  readyState: 4,
  currentTime: 1,
  duration: 35,
  src: 'blob:first',
  srcAttribute: 'blob:first',
};
const before = {
  observerPresent: true,
  timeOrigin: 1,
  backgroundState: 'running',
  audio: [playing],
  audioEvents: [],
};
const after = {
  ...before,
  audio: [{ ...playing, paused: true, srcAttribute: '', currentTime: 0 }],
  audioEvents: [{ id: 0, type: 'pause', at: 1100, currentTime: 1.1, ended: false, paused: true }],
};
assert.equal(stopped(before, after, 1000), true);
assert.equal(
  stopped(
    before,
    {
      ...after,
      audioEvents: [{ ...after.audioEvents[0], type: 'emptied', srcAttribute: '', error: 4 }],
    },
    1000,
  ),
  true,
  'Firefox source clear cancels queued pause',
);
assert.equal(
  stopped(
    before,
    {
      ...after,
      audioEvents: [{ ...after.audioEvents[0], type: 'emptied', srcAttribute: 'blob:first' }],
    },
    1000,
  ),
  false,
  'emptied without source release',
);
for (const [label, plant] of [
  ['empty audio', { ...after, audio: [] }],
  ['observer loss', { ...after, observerPresent: false }],
  ['background restarted', { ...after, timeOrigin: 2 }],
  ['natural completion', { ...after, audio: [{ ...after.audio[0], ended: true }] }],
  ['no pause event', { ...after, audioEvents: [] }],
  ['late stop', { ...after, audioEvents: [{ ...after.audioEvents[0], at: 9000 }] }],
  [
    'decode failure',
    {
      ...after,
      audioEvents: [
        ...after.audioEvents,
        { id: 0, type: 'error', at: 1200, srcAttribute: 'blob:first' },
      ],
    },
  ],
])
  assert.equal(stopped(before, plant, 1000), false, label);
assert.equal(stopped({ ...before, audio: [] }, after, 1000), false, 'nothing playing before leave');
assert.equal(
  stopped({ ...before, audio: [{ ...playing, currentTime: 34.9 }] }, after, 1000),
  false,
  'almost ended before leave',
);

const evidence = {
  visibility: [
    { at: 1, state: 'visible' },
    { at: 900, state: 'hidden' },
  ],
  pagehide: [],
  paragraphs: [
    { at: 100, index: 0, text: 'First paragraph' },
    { at: 35101, index: 1, text: 'Second paragraph' },
  ],
};
assert.equal(hiddenThroughout(evidence, 1000, 91000), true);
assert.equal(hiddenThroughout(null, 1000, 91000), false);
assert.equal(hiddenThroughout({ ...evidence, visibility: [] }, 1000, 91000), false);
assert.equal(
  hiddenThroughout({ ...evidence, visibility: [{ at: 1, state: 'visible' }] }, 1000, 91000),
  false,
  'sleep on selected source',
);
assert.equal(
  hiddenThroughout(
    {
      ...evidence,
      visibility: [
        ...evidence.visibility,
        { at: 5000, state: 'visible' },
        { at: 5001, state: 'hidden' },
      ],
    },
    1000,
    91000,
  ),
  false,
  'brief reselection',
);
assert.equal(hiddenThroughout({ ...evidence, pagehide: [3000] }, 1000, 91000), false);
assert.equal(hiddenThroughout(evidence, 1000, 90000), false);
const continued = {
  ...before,
  audio: [{ ...playing, currentTime: 21, src: 'blob:third' }],
  audioEvents: [
    {
      id: 0,
      type: 'ended',
      at: 35100,
      duration: 35,
      currentTime: 35,
      ended: true,
      src: 'blob:first',
    },
    { id: 0, type: 'playing', at: 35102, src: 'blob:second' },
    {
      id: 0,
      type: 'ended',
      at: 70100,
      duration: 35,
      currentTime: 35,
      ended: true,
      src: 'blob:second',
    },
    { id: 0, type: 'playing', at: 70102, src: 'blob:third' },
  ],
};
assert.equal(advancing(before, continued, 85), true);
assert.equal(advancing(before, { ...continued, audioEvents: [] }, 85), false);
assert.equal(crossedParagraph(before, continued, evidence, 1000, 91000), true);
assert.equal(
  crossedParagraph(before, { ...continued, audioEvents: [] }, evidence, 1000, 91000),
  false,
  'prefetch/highlight alone is not playback',
);
assert.equal(
  crossedParagraph(
    before,
    continued,
    { ...evidence, paragraphs: evidence.paragraphs.slice(0, 1) },
    1000,
    91000,
  ),
  false,
  'another clip in same paragraph',
);
assert.equal(
  crossedParagraph(before, continued, evidence, 40000, 91000),
  false,
  'boundary outside window',
);

// Never needs a socket: simulate a server that returns headers but hangs its body.
const originalFetch = globalThis.fetch;
let killed = false;
let aborted = false;
const keepAlive = setInterval(() => {}, 1000);
try {
  globalThis.fetch = async (_url, { signal }) => ({
    text: () =>
      new Promise((_resolve, reject) => {
        assert.ok(signal, 'DELETE must carry a timeout signal');
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(signal.reason);
          },
          { once: true },
        );
      }),
  });
  const driver = new Driver(
    'http://fixture.invalid',
    'session',
    {
      kill: () => {
        killed = true;
      },
    },
    [],
  );
  const start = performance.now();
  await driver.quit();
  assert.ok(aborted && killed, 'a stalled DELETE must abort and still terminate the process');
  assert.ok(performance.now() - start < 6500, 'teardown must be bounded');
} finally {
  clearInterval(keepAlive);
  globalThis.fetch = originalFetch;
}
console.log('PASS background journey false-positive plants and bounded teardown');
