/**
 * Proso post-checkout page.
 *
 * Paddle redirects here with the completed transaction id in `_ptxn`. That id
 * routes the request; it does not authorise it. Paddle publishes it in the URL
 * by design, so it reaches history, logs and screenshots — anyone holding one
 * must still be unable to obtain the licence key.
 *
 * What authorises is the claim secret this browser minted at the buy click and
 * parked in `sessionStorage`; the server holds only its SHA-256, copied
 * through Paddle's signed custom data. Contract: `schemas/checkout.ts` in
 * `@proso/shared`.
 *
 *   POST {apiBaseUrl}/api/v1/license/by-transaction  { transactionId, claimSecret }
 *     200 { status: 'issued',  licenseKey, tier, issuedAt }
 *     202 { status: 'pending', retryAfterMs }
 *
 * `pending` is the server's only unavailable answer and it is deliberately
 * ambiguous — an unknown transaction, a webhook still in flight and a wrong
 * claim are indistinguishable, so nobody can use this page to discover which
 * purchases exist. This page therefore treats `pending` as "not yet" and
 * retries until its budget runs out, then says both things that could be true.
 * Every outcome ends in a sentence the buyer can act on; none ends in a blank
 * panel.
 *
 * Two bounds sit between this page and a misbehaving service. The retry delay
 * the server suggests is clamped to a safe floor and ceiling — a zero,
 * negative or unbounded delay must never hot-loop the licence service — and
 * every request is aborted when it does not answer in time, so a hung
 * connection cannot stall the page past its budget.
 *
 * Human recovery never treats the transaction id as identity. Paddle puts
 * `_ptxn` in URLs by design, so anyone may hold one; support releases a key
 * only after verifying the purchaser through Paddle's records (the checkout
 * email and receipt). Every recovery sentence on this page says so.
 */

(() => {
  // Mirrors LICENSE_BY_TRANSACTION_PATH in @proso/shared/schemas/checkout.ts.
  const LICENSE_BY_TRANSACTION_PATH = '/api/v1/license/by-transaction';
  const CLAIM_STORAGE_KEY = 'proso.license-claim-secret';
  const MAX_WAIT_MS = 60000;
  const DEFAULT_RETRY_MS = 3000;
  const MIN_RETRY_MS = 1000;
  const MAX_RETRY_MS = 30000;
  const REQUEST_TIMEOUT_MS = 10000;
  const SUPPORT_EMAIL = 'commercial@proso.com.br';

  function el(id) {
    return document.getElementById(id);
  }

  function show(state) {
    ['checkout-waiting', 'checkout-key', 'checkout-problem'].forEach((id) => {
      const node = el(id);
      if (node) node.hidden = id !== state;
    });
  }

  function fail(message) {
    const node = el('checkout-problem-text');
    if (node) node.textContent = message;
    show('checkout-problem');
  }

  function transactionIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('_ptxn') || params.get('transaction_id') || '';
  }

  /**
   * The shared contract promises a positive integer delay, but the page must
   * not trust that promise at its own expense: zero, negatives, NaN, Infinity
   * and anything else malformed collapse to the default, and every finite
   * value is bounded to the floor and ceiling below.
   */
  function clampRetryAfterMs(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_RETRY_MS;
    const rounded = Math.round(value);
    if (rounded < MIN_RETRY_MS) return MIN_RETRY_MS;
    if (rounded > MAX_RETRY_MS) return MAX_RETRY_MS;
    return rounded;
  }

  /** Accepts only what the shared contract describes; anything else is an error. */
  function readResponseBody(body) {
    if (!body || typeof body !== 'object') return null;
    if (body.status === 'issued') {
      if (typeof body.licenseKey !== 'string' || body.licenseKey.length === 0) return null;
      return { status: 'issued', licenseKey: body.licenseKey, tier: body.tier };
    }
    if (body.status === 'pending') {
      const retry = typeof body.retryAfterMs === 'number' ? body.retryAfterMs : DEFAULT_RETRY_MS;
      return { status: 'pending', retryAfterMs: clampRetryAfterMs(retry) };
    }
    return null;
  }

  function renderKey(result) {
    const field = el('license-key-value');
    if (field) field.textContent = result.licenseKey;

    const tierLine = el('license-key-tier');
    if (tierLine && result.tier) {
      tierLine.textContent = 'Plan: ' + result.tier;
      tierLine.hidden = false;
    }

    show('checkout-key');
  }

  function claimSecret() {
    try {
      return window.sessionStorage.getItem(CLAIM_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function forgetClaimSecret() {
    try {
      window.sessionStorage.removeItem(CLAIM_STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unreachable.
    }
  }

  /** The one sentence for every "the retry budget ran out" outcome. */
  function budgetMessage() {
    return (
      'No licence key came back for this purchase. Either the payment confirmation ' +
      'is still in flight, or this browser is not the one that started the ' +
      'checkout. Reload this page in a minute, or email ' +
      SUPPORT_EMAIL +
      ' \u2014 support will verify the purchaser against Paddle\u2019s records before ' +
      'releasing any key. The transaction id alone is not enough.'
    );
  }

  /**
   * One claim request, bounded in time. A connection that hangs is aborted and
   * read as a transport failure, so the page can never wait on it forever, and
   * a request that would start after the budget is not started at all.
   */
  function requestKey(apiBaseUrl, transactionId, secret, deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(budgetMessage());

    const controller = new AbortController();
    const timeoutMs = Math.min(REQUEST_TIMEOUT_MS, remaining);
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    return fetch(apiBaseUrl.replace(/\/+$/, '') + LICENSE_BY_TRANSACTION_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ transactionId: transactionId, claimSecret: secret }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok && response.status !== 202) {
          throw new Error(
            'The licence service answered with an error (HTTP ' + response.status + ').',
          );
        }
        return response.json();
      })
      .catch((error) => {
        if (error && error.name === 'AbortError') {
          throw new Error(
            'The licence service did not answer in time. It may be busy or unreachable. ' +
              'Reload this page in a minute, or email ' +
              SUPPORT_EMAIL +
              ' \u2014 support will verify the purchaser against Paddle\u2019s records before ' +
              'releasing any key.',
          );
        }
        throw error;
      })
      .finally(() => window.clearTimeout(timer));
  }

  function poll(apiBaseUrl, transactionId, secret, deadline) {
    return requestKey(apiBaseUrl, transactionId, secret, deadline).then((body) => {
      const result = readResponseBody(body);
      if (!result) {
        throw new Error('The licence service sent an answer this page could not read.');
      }
      if (result.status === 'issued') {
        renderKey(result);
        return;
      }
      if (Date.now() + result.retryAfterMs > deadline) {
        throw new Error(budgetMessage());
      }
      return new Promise((resolve) => {
        window.setTimeout(resolve, result.retryAfterMs);
      }).then(() => poll(apiBaseUrl, transactionId, secret, deadline));
    });
  }

  function initCopy() {
    const button = el('license-key-copy');
    const field = el('license-key-value');
    const status = el('license-key-copy-status');
    if (!button || !field) return;

    button.addEventListener('click', () => {
      const key = field.textContent || '';
      if (!key) return;

      const done = (message) => {
        if (status) status.textContent = message;
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(key).then(
          () => {
            // The key is now in the buyer's hands; the claim secret has no
            // further use and should not outlive its purpose.
            forgetClaimSecret();
            done('Copied.');
          },
          () => {
            done('Copy failed — select the key and copy it yourself.');
          },
        );
      } else {
        done('This browser blocked the copy — select the key and copy it yourself.');
      }
    });
  }

  function initSuccess() {
    if (!el('checkout-waiting')) return;
    initCopy();

    const transactionId = transactionIdFromUrl();
    const idField = el('transaction-id-value');
    if (idField) idField.textContent = transactionId || 'not provided';

    if (!transactionId) {
      fail(
        'This page needs the transaction id Paddle adds when it sends you here. ' +
          'Open the link in your payment confirmation email, or email ' +
          SUPPORT_EMAIL +
          ' and support will look the purchase up through Paddle\u2019s records.',
      );
      return;
    }

    const config = window.PROSO_CHECKOUT_CONFIG;
    const apiBaseUrl =
      config && typeof config.apiBaseUrl === 'string' && /^https:\/\//i.test(config.apiBaseUrl)
        ? config.apiBaseUrl
        : null;
    if (!apiBaseUrl) {
      fail('Checkout is unavailable: the Proso API address is not a valid HTTPS URL.');
      return;
    }

    // The transaction id alone is not enough to ask for a key, and the page must
    // not pretend otherwise by sending a request that can only be refused.
    const secret = claimSecret();
    if (!secret) {
      fail(
        'This browser has no claim for that purchase. A licence key can only be ' +
          'collected in the tab that started the checkout \u2014 the transaction id on ' +
          'its own is not proof of payment. Email ' +
          SUPPORT_EMAIL +
          ' and support will verify the purchaser against Paddle\u2019s records \u2014 your ' +
          'checkout email and receipt \u2014 before releasing any key.',
      );
      return;
    }

    show('checkout-waiting');
    try {
      poll(apiBaseUrl, transactionId, secret, Date.now() + MAX_WAIT_MS).catch((error) => {
        fail(error && error.message ? error.message : String(error));
      });
    } catch (error) {
      // A synchronous claim-setup failure (a regression letting a malformed
      // configuration through) must land in the visible problem panel, never
      // in a waiting panel that pretends the claim is underway.
      fail(error && error.message ? error.message : String(error));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSuccess);
  } else {
    initSuccess();
  }
})();
