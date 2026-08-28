import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { disableAnimations, waitForLayoutStable } from '../helpers/disable-animations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../.output/firefox-mv2');
const POPUP_URL = 'http://127.0.0.1:4273/popup.html';

function builtAsset(directory, prefix, suffix) {
  const root = path.join(EXTENSION_PATH, directory);
  const match = readdirSync(root).find((name) => name.startsWith(prefix) && name.endsWith(suffix));
  if (!match) throw new Error(`built ${prefix}*${suffix} asset is missing under ${root}`);
  return readFileSync(path.join(root, match), 'utf8');
}

function rgbToHex(color) {
  if (!/^rgba?\(/i.test(color.trim())) throw new Error(`unsupported computed color: ${color}`);
  const channels = color.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) throw new Error(`unsupported computed color: ${color}`);
  if (channels.length > 3 && channels[3] < 1) {
    throw new Error(`contrast pair must resolve to an opaque color: ${color}`);
  }
  return `#${channels
    .slice(0, 3)
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function luminance(hex) {
  const channels = hex
    .match(/[0-9a-f]{2}/gi)
    .map((part) => Number.parseInt(part, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectComputedContrast(
  page,
  {
    label,
    foregroundSelector,
    foregroundProperty = 'color',
    backgroundSelector,
    backgroundProperty = 'background-color',
    minimum,
  },
) {
  const pair = await page.evaluate(
    ({ foregroundSelector, foregroundProperty, backgroundSelector, backgroundProperty }) => ({
      foreground: getComputedStyle(document.querySelector(foregroundSelector)).getPropertyValue(
        foregroundProperty,
      ),
      background: getComputedStyle(document.querySelector(backgroundSelector)).getPropertyValue(
        backgroundProperty,
      ),
    }),
    { foregroundSelector, foregroundProperty, backgroundSelector, backgroundProperty },
  );
  const foreground = rgbToHex(pair.foreground);
  const background = rgbToHex(pair.background);
  expect(
    contrast(foreground, background),
    `${label}: ${foreground} on ${background}`,
  ).toBeGreaterThanOrEqual(minimum);
}

async function expectPlayerContrast(page) {
  for (const pair of [
    {
      label: 'status text',
      foregroundSelector: '#status-text',
      backgroundSelector: 'body',
      minimum: 4.5,
    },
    {
      label: 'paragraph position',
      foregroundSelector: '#paragraph-info',
      backgroundSelector: 'body',
      minimum: 4.5,
    },
    {
      label: 'secondary transport boundary',
      foregroundSelector: '#prev-btn',
      foregroundProperty: 'border-top-color',
      backgroundSelector: 'body',
      minimum: 3,
    },
    {
      label: 'seek track boundary',
      foregroundSelector: '#progress-container',
      foregroundProperty: 'border-top-color',
      backgroundSelector: 'body',
      minimum: 3,
    },
    {
      label: 'speed track boundary',
      foregroundSelector: '#speed-slider',
      foregroundProperty: 'border-top-color',
      backgroundSelector: 'body',
      minimum: 3,
    },
    {
      label: 'primary transport label',
      foregroundSelector: '#play-pause-btn',
      backgroundSelector: '#play-pause-btn',
      minimum: 4.5,
    },
  ]) {
    await expectComputedContrast(page, pair);
  }
}

async function expectNoRenderedEffects(page) {
  const violations = await page.locator('#popup, #popup *').evaluateAll((nodes) =>
    nodes
      .flatMap((node) =>
        ['', '::before', '::after'].map((pseudo) => {
          const style = getComputedStyle(node, pseudo || null);
          return {
            element: `${node.id || node.getAttribute('class') || node.tagName.toLowerCase()}${pseudo}`,
            backgroundImage: style.backgroundImage,
            boxShadow: style.boxShadow,
            filter: style.filter,
            backdropFilter: style.getPropertyValue('backdrop-filter'),
          };
        }),
      )
      .filter(
        ({ backgroundImage, boxShadow, filter, backdropFilter }) =>
          /gradient/i.test(backgroundImage) ||
          boxShadow !== 'none' ||
          filter !== 'none' ||
          (backdropFilter !== '' && backdropFilter !== 'none'),
      ),
  );
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

async function openPopup(page, colorScheme = 'light', freezeMotion = true) {
  await page.setViewportSize({ width: 360, height: 550 });
  await page.emulateMedia({ colorScheme, reducedMotion: 'no-preference' });
  await page.route('**/chunks/*.js', (route) => route.abort());
  await page.goto(POPUP_URL);
  await page.waitForLoadState('domcontentloaded');
  if (freezeMotion) await disableAnimations(page);
  await waitForLayoutStable(page, '#popup', 60);
}

async function roles(page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const get = (name) => style.getPropertyValue(name).trim().toUpperCase();
    return {
      ink: get('--popup-ink'),
      paper: get('--popup-paper'),
      brandOnInk: get('--popup-brand-on-ink'),
      actionOnPaper: get('--popup-action-on-paper'),
      background: getComputedStyle(document.body).backgroundColor,
      color: getComputedStyle(document.body).color,
    };
  });
}

async function showFirstRun(page) {
  await page.evaluate(() => {
    const panel = document.getElementById('panel-player');
    const firstRun = document.getElementById('first-run-panel');
    panel?.classList.add('proso-popup__panel--firstrun');
    if (firstRun) firstRun.hidden = false;
  });
  await waitForLayoutStable(page, '#first-run-panel', 60);
}

async function selectPanel(page, name) {
  await page.evaluate((target) => {
    for (const tab of document.querySelectorAll('[role="tab"]')) {
      const selected = tab.getAttribute('data-tab') === target;
      tab.classList.toggle('proso-popup__tab--active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of document.querySelectorAll('[role="tabpanel"]')) {
      const selected = panel.id === `panel-${target}`;
      panel.classList.toggle('proso-popup__panel--active', selected);
      panel.hidden = !selected;
    }
  }, name);
  await waitForLayoutStable(page, `#panel-${name}`, 60);
}

async function populateQueue(page) {
  await page.evaluate(() => {
    const badge = document.getElementById('queue-tab-badge');
    const count = document.getElementById('queue-count');
    const list = document.getElementById('queue-list');
    const empty = document.getElementById('queue-empty-message');
    if (badge) {
      badge.hidden = false;
      badge.textContent = '1';
    }
    if (count) count.textContent = '1 item';
    if (empty) empty.hidden = true;
    if (list) {
      list.innerHTML = `<div class="proso-popup__queue-item">
        <span class="proso-popup__queue-item-status" aria-hidden="true">1</span>
        <span class="proso-popup__queue-item-info">
          <span class="proso-popup__queue-item-title">A deliberately long article title that must never push queue actions outside the popup</span>
          <span class="proso-popup__queue-item-domain">example.com</span>
        </span>
        <button class="proso-popup__queue-item-remove" aria-label="Remove from queue">×</button>
      </div>`;
    }
  });
  await waitForLayoutStable(page, '#panel-queue', 60);
}

async function showRouteError(page) {
  await page.evaluate(() => {
    const status = document.getElementById('first-run-host-status');
    if (status) {
      status.textContent = 'The host could not be reached.';
      status.classList.add('proso-popup__route-status--error');
    }
  });
}

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(
    dimensions.document,
    `document overflow: ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, `body overflow: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(
    dimensions.viewport + 1,
  );
}

test.describe('Feature 228 popup visual contract', () => {
  test('built popup contains no generic effect or dead-summary escape hatch', async () => {
    const css = readFileSync(
      path.resolve(__dirname, '../../src/entrypoints/popup/style.css'),
      'utf8',
    );
    const js = builtAsset('chunks', 'popup-', '.js');
    const forbiddenCss = [
      /(?:linear|radial)-gradient/i,
      /--shadow-accent/i,
      /backdrop-filter/i,
      /filter\s*:\s*(?:brightness|blur|drop-shadow)/i,
      /:hover[^}]*transform\s*:\s*scale/is,
      /@keyframes\s+pulse/i,
    ];
    for (const pattern of forbiddenCss)
      expect(css, `forbidden popup CSS: ${pattern}`).not.toMatch(pattern);

    const intrinsicRules = css.match(/html,\s*body\s*\{([^}]*)\}/i)?.[1];
    expect(intrinsicRules, 'html/body intrinsic sizing block').toBeTruthy();
    expect(intrinsicRules, 'popup width must retain its 360px intrinsic fallback').toMatch(
      /width\s*:\s*var\(--popup-width,\s*360px\)/i,
    );
    expect(
      intrinsicRules,
      'intrinsic width must not depend on the provisional viewport',
    ).not.toMatch(/(?:width|max-width)\s*:[^;]*(?:\bvw\b|%|\bmin\s*\()/i);

    expect(js, 'built popup JS must not inject a scale/filter effect').not.toMatch(
      /style\.(?:transform|filter)\s*=\s*["'`][^"'`]*(?:scale|blur|drop-shadow|brightness)/i,
    );
    expect(css).not.toMatch(/proso-popup__(?:summarize|summary)/);
    expect(js).not.toMatch(/summarize-section|summarize-btn|summary-display/);
  });

  test('player hierarchy and accessible color roles hold in light and dark', async ({ page }) => {
    await openPopup(page, 'light');
    const light = await roles(page);
    expect(light).toMatchObject({
      ink: '#010616',
      paper: '#F8F8F9',
      brandOnInk: '#21F299',
      actionOnPaper: '#006B4F',
    });
    expect(contrast(light.brandOnInk, light.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light.actionOnPaper, light.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light.brandOnInk, light.paper)).toBeLessThan(3);
    expect(contrast(light.actionOnPaper, light.ink)).toBeLessThan(4.5);

    await expect(page.locator('[role="tablist"]')).toHaveCount(1);
    await expect(page.locator('[role="tab"]')).toHaveCount(3);
    await expect(page.locator('[role="tabpanel"]')).toHaveCount(3);
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
    await expect(page.locator('[role="tabpanel"]:not([hidden])')).toHaveCount(1);
    await expect(page.locator('.proso-popup__transport-primary')).toHaveCount(1);

    for (const selector of [
      '#status-text',
      '#paragraph-info',
      '#progress-seek',
      '#prev-btn',
      '#play-pause-btn',
      '#next-btn',
      '#stop-btn',
      '#speed-slider',
    ]) {
      await expect(page.locator(selector), `${selector} must stay visible`).toBeVisible();
    }
    await expect(page.locator('.proso-popup__status')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    const progressBox = await page.locator('#progress-container').boundingBox();
    const seekBox = await page.locator('#progress-seek').boundingBox();
    expect(seekBox?.width).toBeGreaterThanOrEqual(progressBox?.width ?? Number.POSITIVE_INFINITY);
    expect(seekBox?.height).toBeGreaterThanOrEqual(progressBox?.height ?? Number.POSITIVE_INFINITY);
    await expectPlayerContrast(page);
    await expectNoRenderedEffects(page);

    for (const selector of [
      '#prev-btn',
      '#play-pause-btn',
      '#next-btn',
      '#stop-btn',
      '#settings-btn',
    ]) {
      const box = await page.locator(selector).boundingBox();
      expect(box, `${selector} has no box`).not.toBeNull();
      expect(box.width, `${selector} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${selector} height`).toBeGreaterThanOrEqual(44);
    }
    const primaryBox = await page.locator('#play-pause-btn').boundingBox();
    expect(primaryBox?.width).toBe(56);
    expect(primaryBox?.height).toBe(56);

    const tabsStyle = await page.locator('.proso-popup__tabs').evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        background: style.backgroundColor,
        radius: Number.parseFloat(style.borderRadius) || 0,
      };
    });
    expect(tabsStyle.background).toBe('rgba(0, 0, 0, 0)');
    expect(tabsStyle.radius).toBeLessThanOrEqual(2);
    for (const selector of ['#play-pause-btn', '#progress-bar']) {
      const effects = await page.locator(selector).evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          backgroundImage: style.backgroundImage,
          boxShadow: style.boxShadow,
          filter: style.filter,
        };
      });
      expect(effects.backgroundImage, `${selector} gradient`).toBe('none');
      expect(effects.boxShadow, `${selector} glow`).toBe('none');
      expect(effects.filter, `${selector} filter`).toBe('none');
    }

    await expect(page.locator('#popup')).toHaveScreenshot('popup-player-light.png');
    await page.locator('#play-pause-btn').focus();
    await expect(page.locator('#play-pause-btn')).toBeFocused();
    const outline = await page.locator('#play-pause-btn').evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    expect(outline.width).toBeGreaterThanOrEqual(2);
    expect(outline.style).not.toBe('none');
    await expect(page.locator('#popup')).toHaveScreenshot('popup-focus-light.png');

    await openPopup(page, 'dark');
    const dark = await roles(page);
    expect(dark.background).not.toBe(light.background);
    expect(dark.color).not.toBe(light.color);
    await expect(page.locator('.proso-popup__status')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expectPlayerContrast(page);
    await expectNoRenderedEffects(page);
    await expect(page.locator('#popup')).toHaveScreenshot('popup-player-dark.png');
    await page.locator('#play-pause-btn').focus();
    await expect(page.locator('#popup')).toHaveScreenshot('popup-focus-dark.png');
  });

  test('first-run keeps both routes and removes transport from layout', async ({ page }) => {
    await openPopup(page, 'light');
    await showFirstRun(page);
    await expectNoRenderedEffects(page);
    for (const selector of [
      '#first-run-host-url',
      '#first-run-host-connect',
      '#first-run-byok-provider',
      '#first-run-byok-key',
      '#first-run-byok-save',
    ]) {
      await expect(page.locator(selector)).toBeVisible();
    }
    await expect(page.locator('#first-run-subtitle')).toContainText('no account');
    await expect(page.locator('.proso-popup__route-note')).toContainText('exact address');
    for (const selector of ['#first-run-host-url', '#first-run-byok-provider']) {
      await expectComputedContrast(page, {
        label: `${selector} boundary`,
        foregroundSelector: selector,
        foregroundProperty: 'border-top-color',
        backgroundSelector: '.proso-popup__route',
        minimum: 3,
      });
    }
    await expect(page).toHaveScreenshot('popup-first-run-viewport-light.png');

    for (const selector of [
      '#progress-container',
      '.proso-popup__controls',
      '.proso-popup__speed',
    ]) {
      await expect(page.locator(selector)).toBeHidden();
    }
    const scrollState = await page.evaluate(() => {
      const popup = document.getElementById('popup');
      return {
        clientHeight: document.documentElement.clientHeight,
        bodyScrollHeight: document.body.scrollHeight,
        popupScrollHeight: popup?.scrollHeight ?? 0,
      };
    });
    const contentHeight = Math.max(scrollState.bodyScrollHeight, scrollState.popupScrollHeight);
    expect(contentHeight).toBeGreaterThan(scrollState.clientHeight);
    await page.setViewportSize({ width: 360, height: Math.min(contentHeight, 800) });
    await page.evaluate(() => {
      document.documentElement.style.maxHeight = 'none';
      document.body.style.maxHeight = 'none';
      document.body.style.overflow = 'visible';
    });
    await expect(page.locator('#popup')).toHaveScreenshot('popup-first-run-light.png');

    await showRouteError(page);
    await expectComputedContrast(page, {
      label: 'light first-run route error',
      foregroundSelector: '#first-run-host-status',
      backgroundSelector: '.proso-popup__route',
      minimum: 4.5,
    });

    await openPopup(page, 'dark');
    await showFirstRun(page);
    await showRouteError(page);
    await expectNoRenderedEffects(page);
    await expectComputedContrast(page, {
      label: 'dark first-run route error',
      foregroundSelector: '#first-run-host-status',
      backgroundSelector: '.proso-popup__route',
      minimum: 4.5,
    });
    for (const selector of ['#first-run-host-url', '#first-run-byok-provider']) {
      await expectComputedContrast(page, {
        label: `dark ${selector} boundary`,
        foregroundSelector: selector,
        foregroundProperty: 'border-top-color',
        backgroundSelector: '.proso-popup__route',
        minimum: 3,
      });
    }
  });

  test('Tools and long-title Queue remain direct and dead tools stay absent', async ({ page }) => {
    await openPopup(page, 'light');
    await expect(page.locator('#summarize-section')).toHaveCount(0);
    await selectPanel(page, 'tools');
    await expectNoRenderedEffects(page);
    await expect(page.locator('#highlights-section')).toBeVisible();
    await expect(page.locator('#ocr-section')).toBeHidden();

    await selectPanel(page, 'queue');
    await populateQueue(page);
    await expectNoRenderedEffects(page);
    await expect(page.locator('#queue-tab-badge')).toHaveText('1');
    await expect(page.locator('#queue-count')).toHaveText('1 item');
    await expect(page.getByRole('button', { name: 'Add to reading queue' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove from queue' })).toBeVisible();
    await expectComputedContrast(page, {
      label: 'light queue count badge',
      foregroundSelector: '#queue-tab-badge',
      backgroundSelector: '#queue-tab-badge',
      minimum: 4.5,
    });
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('#popup')).toHaveScreenshot('popup-queue-long-title-light.png');

    await openPopup(page, 'dark');
    await selectPanel(page, 'queue');
    await populateQueue(page);
    await expectNoRenderedEffects(page);
    await expectComputedContrast(page, {
      label: 'dark queue count badge',
      foregroundSelector: '#queue-tab-badge',
      backgroundSelector: '#queue-tab-badge',
      minimum: 4.5,
    });
  });

  test('permission and exhausted-credit state stay factual and non-color-only', async ({
    page,
  }) => {
    await openPopup(page, 'light');
    await page.evaluate(() => {
      const grant = document.getElementById('grant-access-row');
      const reason = document.getElementById('grant-access-reason');
      if (grant) grant.hidden = false;
      if (reason) reason.textContent = 'Host access is required before this page can be read.';
      const credits = document.getElementById('credits-section');
      const remaining = document.getElementById('credits-remaining');
      const total = document.getElementById('credits-total');
      const warning = document.getElementById('credits-warning');
      const fill = document.getElementById('credits-bar-fill');
      if (credits) credits.hidden = false;
      if (remaining) remaining.textContent = '0';
      if (total) total.textContent = '/ 500,000';
      if (warning) {
        warning.hidden = false;
        warning.textContent = 'Managed credits exhausted. Use your own key or local host.';
        warning.className = 'proso-popup__credits-warning proso-popup__credits-warning--exhausted';
      }
      fill?.classList.add('proso-popup__credits-bar-fill--exhausted');
    });
    await expectNoRenderedEffects(page);
    await expect(page.getByRole('button', { name: 'Grant access' })).toBeVisible();
    await expect(page.locator('#credits-warning')).toContainText('exhausted');
    const semanticColor = await page
      .locator('#credits-warning')
      .evaluate((node) => getComputedStyle(node).color);
    const brandColors = await roles(page);
    expect(rgbToHex(semanticColor)).not.toBe(brandColors.brandOnInk);
    expect(rgbToHex(semanticColor)).not.toBe(brandColors.actionOnPaper);
    await expectComputedContrast(page, {
      label: 'exhausted-credit message',
      foregroundSelector: '#credits-warning',
      backgroundSelector: 'body',
      minimum: 4.5,
    });
    await expect(page.locator('#popup')).toHaveScreenshot('popup-permission-exhausted-light.png');

    const populated = await page.evaluate(() => {
      const remaining = document.getElementById('credits-remaining');
      const warning = document.getElementById('credits-warning');
      const fill = document.getElementById('credits-bar-fill');
      if (remaining) remaining.textContent = '320,000';
      if (warning) warning.hidden = true;
      if (fill) {
        fill.className = 'proso-popup__credits-bar-fill proso-popup__credits-bar-fill--normal';
        fill.style.width = '64%';
      }
      const root = getComputedStyle(document.documentElement);
      return {
        fill: fill ? getComputedStyle(fill).backgroundColor : '',
        infoRole: root.getPropertyValue('--popup-info').trim().toUpperCase(),
      };
    });
    await expect(page.locator('#credits-remaining')).toHaveText('320,000');
    expect(rgbToHex(populated.fill)).toBe(populated.infoRole);

    await page.evaluate(() => {
      const estimate = document.getElementById('cost-estimate');
      const savingsRow = document.getElementById('cost-savings-row');
      const savings = document.getElementById('cost-savings');
      if (estimate) estimate.textContent = '$0.12';
      if (savingsRow) savingsRow.hidden = false;
      if (savings) savings.textContent = '$0.04 (25%)';
    });
    await expect(page.locator('#cost-estimate')).toHaveText('$0.12');
    await expect(page.locator('#cost-savings')).toHaveText('$0.04 (25%)');
    for (const [label, foregroundSelector] of [
      ['populated cost', '#cost-estimate'],
      ['cache savings', '#cost-savings'],
    ]) {
      await expectComputedContrast(page, {
        label,
        foregroundSelector,
        backgroundSelector: 'body',
        minimum: 4.5,
      });
    }
    const savingsColor = await page
      .locator('#cost-savings')
      .evaluate((node) => getComputedStyle(node).color);
    expect(rgbToHex(savingsColor)).not.toBe(brandColors.brandOnInk);
    expect(rgbToHex(savingsColor)).not.toBe(brandColors.actionOnPaper);
  });

  test('200% browser zoom preserves the intrinsic popup without horizontal overflow', async ({
    page,
  }) => {
    await openPopup(page, 'light');
    await page.setViewportSize({ width: 200, height: 550 });
    const intrinsicWidth = await page.evaluate(() => ({
      html: document.documentElement.getBoundingClientRect().width,
      body: document.body.getBoundingClientRect().width,
    }));
    expect(intrinsicWidth).toEqual({ html: 360, body: 360 });

    // Firefox toolbar panels preserve the popup's 360 CSS-pixel intrinsic width
    // and expand the outer panel under full-page zoom. CSS zoom + a doubled
    // viewport reproduces that contract without the false 20px intrinsic loop
    // caused by a 100vw width cap.
    await page.setViewportSize({ width: 720, height: 800 });
    await page.evaluate(() => {
      document.documentElement.style.overflowY = 'scroll';
      document.body.style.zoom = '2';
    });
    await expectNoHorizontalOverflow(page);
    for (const selector of ['#prev-btn', '#play-pause-btn', '#next-btn', '#stop-btn']) {
      await expect(page.locator(selector)).toBeVisible();
      const box = await page.locator(selector).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(88);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(88);
    }
  });

  test('reduced motion removes nonessential popup animation', async ({ page }) => {
    await openPopup(page, 'dark', false);
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    const motion = await page.locator('#play-pause-btn').evaluate((node) => {
      const style = getComputedStyle(node);
      return { animation: style.animationDuration, transition: style.transitionDuration };
    });
    expect(Number.parseFloat(motion.animation) || 0).toBeLessThanOrEqual(0.01);
    expect(Number.parseFloat(motion.transition) || 0).toBeLessThanOrEqual(0.01);
  });
});
