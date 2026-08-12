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
 */

(() => {
  // Mirrors LICENSE_BY_TRANSACTION_PATH in @proso/shared/schemas/checkout.ts.
  const LICENSE_BY_TRANSACTION_PATH = '/api/v1/license/by-transaction';
  const CLAIM_STORAGE_KEY = 'proso.license-claim-secret';
  const MAX_WAIT_MS = 60000;
  const DEFAULT_RETRY_MS = 3000;
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

  /** Accepts only what the shared contract describes; anything else is an error. */
  function readResponseBody(body) {
    if (!body || typeof body !== 'object') return null;
    if (body.status === 'issued') {
      if (typeof body.licenseKey !== 'string' || body.licenseKey.length === 0) return null;
      return { status: 'issued', licenseKey: body.licenseKey, tier: body.tier };
    }
    if (body.status === 'pending') {
      const retry = typeof body.retryAfterMs === 'number' ? body.retryAfterMs : DEFAULT_RETRY_MS;
      return { status: 'pending', retryAfterMs: retry };
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

  function requestKey(apiBaseUrl, transactionId, secret) {
    return fetch(apiBaseUrl.replace(/\/+$/, '') + LICENSE_BY_TRANSACTION_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ transactionId: transactionId, claimSecret: secret }),
    }).then((response) => {
      if (!response.ok && response.status !== 202) {
        throw new Error(
          'The licence service answered with an error (HTTP ' + response.status + ').',
        );
      }
      return response.json();
    });
  }

  function poll(apiBaseUrl, transactionId, secret, deadline) {
    return requestKey(apiBaseUrl, transactionId, secret).then((body) => {
      const result = readResponseBody(body);
      if (!result) {
        throw new Error('The licence service sent an answer this page could not read.');
      }
      if (result.status === 'issued') {
        renderKey(result);
        return;
      }
      if (Date.now() + result.retryAfterMs > deadline) {
        throw new Error(
          'No licence key came back for this purchase. Either the payment confirmation ' +
            'is still in flight, or this browser is not the one that started the ' +
            'checkout. Reload this page in a minute, or email ' +
            SUPPORT_EMAIL +
            ' with the transaction id above and we will send your key.',
        );
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
          ' and we will look it up.',
      );
      return;
    }

    const config = window.PROSO_CHECKOUT_CONFIG;
    if (!config || !config.apiBaseUrl) {
      fail('Checkout is unavailable: the Proso API address is not configured on this site.');
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
          ' with the transaction id above and we will send your key.',
      );
      return;
    }

    show('checkout-waiting');
    poll(config.apiBaseUrl, transactionId, secret, Date.now() + MAX_WAIT_MS).catch((error) => {
      fail(error && error.message ? error.message : String(error));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSuccess);
  } else {
    initSuccess();
  }
})();
