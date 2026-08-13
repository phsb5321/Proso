/**
 * Proso Checkout — Paddle overlay, opened from the pricing page.
 *
 * Reads assets/js/checkout-config.js. Every buy control is a real <button>;
 * when the configuration it needs is missing or malformed the button is left
 * inert (aria-disabled, still keyboard-reachable) and the reason is written
 * next to it. A missing price id never produces a button that looks alive and
 * does nothing.
 *
 * Paddle's script is fetched on the first activation, not on page load — the
 * pricing page stays free of third-party code until a visitor chooses to buy.
 * A failed load is not cached, so a later click can try again.
 *
 * Exactly one checkout — and therefore one claim secret — can be in flight at
 * a time. While it is, every buy control is visibly disabled with a stated
 * reason; a second click must not mint a second secret over the one the open
 * checkout is already carrying, or a paid purchase could strand. The lock
 * releases only on a proved close or completion (registered through Paddle's
 * initialization seam) or on a failure the buyer saw.
 *
 * Each purchase carries a secret this browser mints. Paddle puts the
 * transaction id in the success URL by design, so that id is routing metadata
 * and cannot authorise anything; the claim secret below is what proves, on the
 * success page, that the person asking for the licence key is the person who
 * paid. Only its SHA-256 travels to Paddle. See `schemas/checkout.ts` in
 * @proso/shared for the whole contract.
 */

(() => {
  const PADDLE_SCRIPT_URL = 'https://cdn.paddle.com/paddle/v2/paddle.js';
  const PRICE_ID_PREFIX = 'pri_';
  const TOKEN_PREFIX = { sandbox: 'test_', production: 'live_' };

  function catalogValues(config, key) {
    const values = config && config.catalog ? config.catalog[key] : null;
    return Array.isArray(values) ? values : [];
  }

  function catalogHas(config, key, value) {
    return catalogValues(config, key).indexOf(value) !== -1;
  }

  // Mirrors @proso/shared/schemas/checkout.ts.
  const CLAIM_SECRET_BYTES = 32;
  const CLAIM_STORAGE_KEY = 'proso.license-claim-secret';
  const CLAIM_HASH_FIELD = 'license_claim_hash';

  /** Web Crypto is required to mint the claim secret; it needs a secure context. */
  function cryptoProblem() {
    const webCrypto = window.crypto;
    if (!webCrypto || typeof webCrypto.getRandomValues !== 'function' || !webCrypto.subtle) {
      return (
        'Checkout is unavailable: this browser did not expose Web Crypto, which is ' +
        'needed to protect your licence key. Open this page over HTTPS and try again.'
      );
    }
    try {
      window.sessionStorage.setItem(CLAIM_STORAGE_KEY + '.probe', '1');
      window.sessionStorage.removeItem(CLAIM_STORAGE_KEY + '.probe');
    } catch {
      return (
        'Checkout is unavailable: this browser blocked session storage, which is ' +
        'needed to hand your licence key over after payment.'
      );
    }
    return null;
  }

  /**
   * Validate the configuration for one tier/period pair.
   * Returns null when it is usable, or a sentence naming what is wrong.
   */
  function configProblem(config, tier, period) {
    if (!config) {
      return 'Checkout is unavailable: assets/js/checkout-config.js did not load.';
    }

    if (!catalogHas(config, 'tiers', tier)) {
      return 'Checkout is unavailable: the ' + tier + ' tier is outside the checkout catalog.';
    }
    if (!catalogHas(config, 'periods', period)) {
      return 'Checkout is unavailable: the ' + period + ' period is outside the checkout catalog.';
    }

    const browserProblem = cryptoProblem();
    if (browserProblem) return browserProblem;

    const expectedPrefix = TOKEN_PREFIX[config.environment];
    if (!expectedPrefix) {
      return 'Checkout is unavailable: environment must be "sandbox" or "production".';
    }

    if (typeof config.clientToken !== 'string' || config.clientToken.length === 0) {
      return 'Checkout is unavailable: the Paddle client-side token is not configured.';
    }

    if (config.clientToken.indexOf(expectedPrefix) !== 0) {
      return (
        'Checkout is unavailable: the ' +
        config.environment +
        ' environment needs a client-side token starting with "' +
        expectedPrefix +
        '".'
      );
    }

    // The success page needs this URL to claim the key the buyer paid for;
    // selling without a claim target would sell a key nobody can receive.
    if (typeof config.apiBaseUrl !== 'string' || !/^https:\/\//i.test(config.apiBaseUrl)) {
      return 'Checkout is unavailable: the Proso API address is not a valid HTTPS URL.';
    }

    const prices = config.prices || {};
    const tierPrices = prices[tier];
    if (!tierPrices) {
      return 'Checkout is unavailable: no prices are configured for the ' + tier + ' tier.';
    }

    const priceId = tierPrices[period];
    if (typeof priceId !== 'string' || priceId.length === 0) {
      return (
        'Checkout is unavailable: the ' +
        period +
        ' price id for the ' +
        tier +
        ' tier is not configured.'
      );
    }

    if (priceId.indexOf(PRICE_ID_PREFIX) !== 0) {
      return (
        'Checkout is unavailable: the ' +
        period +
        ' price id for the ' +
        tier +
        ' tier does not look like a Paddle price id (expected "' +
        PRICE_ID_PREFIX +
        '…").'
      );
    }

    return null;
  }

  /**
   * Which billing period the pricing toggle is currently showing. The toggle
   * writes data-billing onto the enclosing <section>; before it is first used
   * the attribute is absent, which is the monthly view the markup renders.
   */
  function currentPeriod(button) {
    const section = button.closest('section');
    return section && section.getAttribute('data-billing') === 'annual' ? 'yearly' : 'monthly';
  }

  /** The note element that carries a button's stated reason. */
  function noteFor(button) {
    const id = button.getAttribute('aria-describedby');
    return id ? document.getElementById(id) : null;
  }

  function setInert(button, reason) {
    button.setAttribute('aria-disabled', 'true');
    button.classList.add('btn--disabled');
    const note = noteFor(button);
    if (note) {
      note.textContent = reason;
      note.hidden = false;
    }
  }

  function setReady(button) {
    button.setAttribute('aria-disabled', 'false');
    button.classList.remove('btn--disabled');
    const note = noteFor(button);
    if (note) {
      note.textContent = '';
      note.hidden = true;
    }
  }

  /** Load Paddle once, reusing an instance the page already has. */
  function loadPaddle() {
    if (window.Paddle) return Promise.resolve(window.Paddle);
    if (window.__prosoPaddleLoading) return window.__prosoPaddleLoading;

    window.__prosoPaddleLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PADDLE_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        if (window.Paddle) resolve(window.Paddle);
        else reject(new Error('Paddle loaded but did not register itself.'));
      };
      script.onerror = () => {
        reject(new Error('The payment provider could not be reached.'));
      };
      document.head.appendChild(script);
    });

    // A failed load must not poison every later attempt until a page reload:
    // the next buy click starts a fresh load.
    window.__prosoPaddleLoading.catch(() => {
      window.__prosoPaddleLoading = null;
    });

    return window.__prosoPaddleLoading;
  }

  let initialised = false;

  const CHECKOUT_OPEN_REASON =
    'Checkout is already open in this tab. Complete or close it, then try again.';

  /**
   * True from the click that starts a checkout until that checkout provably
   * closed, completed, or failed. While true, every buy control is visibly
   * disabled and states why; a second click must not mint a second claim
   * secret over the one the open checkout is carrying.
   */
  let checkoutInFlight = false;
  let inFlightButtons = null;
  let inFlightConfig = null;

  function holdControls(buttons, config) {
    checkoutInFlight = true;
    inFlightButtons = buttons;
    inFlightConfig = config;
    buttons.forEach((button) => setInert(button, CHECKOUT_OPEN_REASON));
  }

  function releaseCheckout() {
    checkoutInFlight = false;
    if (inFlightButtons && inFlightConfig) {
      refresh(inFlightButtons, inFlightConfig);
    }
    inFlightButtons = null;
    inFlightConfig = null;
  }

  function initialisePaddle(paddle, config) {
    if (initialised) return;
    paddle.Environment.set(config.environment);
    // Paddle Billing registers checkout lifecycle callbacks at initialization,
    // not per Checkout.open call. The lock above must be released through this
    // documented seam, so a contract-conforming Paddle build cannot strand the
    // page as permanently busy.
    paddle.Initialize({
      token: config.clientToken,
      eventCallback: (event) => {
        if (event && (event.name === 'checkout.closed' || event.name === 'checkout.completed')) {
          releaseCheckout();
        }
      },
    });
    initialised = true;
  }

  function base64url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function hex(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) out += ('0' + bytes[i].toString(16)).slice(-2);
    return out;
  }

  /**
   * Mint the claim secret, park the raw value in this tab, and resolve with the
   * digest that is safe to hand to Paddle. Storing before opening checkout is
   * deliberate: a redirect must never outrun the value the success page needs.
   */
  function mintClaim() {
    const raw = new Uint8Array(CLAIM_SECRET_BYTES);
    window.crypto.getRandomValues(raw);
    const claimSecret = base64url(raw);

    return window.crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(claimSecret))
      .then((digest) => {
        window.sessionStorage.setItem(CLAIM_STORAGE_KEY, claimSecret);
        return hex(digest);
      });
  }

  function openCheckout(button, config) {
    const tier = button.getAttribute('data-checkout-tier');
    const period = currentPeriod(button);
    const priceId = config.prices[tier][period];
    const note = noteFor(button);

    button.setAttribute('aria-busy', 'true');

    return Promise.all([loadPaddle(), mintClaim()])
      .then((results) => {
        const paddle = results[0];
        const customData = { tier: tier, billing_period: period };
        // The buyer's browser controls this object, so the server treats tier and
        // period as diagnostics and derives entitlement from the price id.
        customData[CLAIM_HASH_FIELD] = results[1];

        initialisePaddle(paddle, config);
        paddle.Checkout.open({
          items: [{ priceId: priceId, quantity: 1 }],
          customData: customData,
          settings: {
            displayMode: 'overlay',
            theme: 'dark',
            successUrl: new URL('success.html', window.location.href).href,
          },
        });
      })
      .catch((error) => {
        releaseCheckout();
        if (note) {
          note.textContent = error && error.message ? error.message : String(error);
          note.hidden = false;
        }
      })
      .then(() => {
        button.removeAttribute('aria-busy');
      });
  }

  function refresh(buttons, config) {
    buttons.forEach((button) => {
      // The billing toggle rewrites data-billing and re-runs this refresh
      // while a checkout is loading or open. In-flight state must survive it:
      // every buy control stays disabled with the announced reason until the
      // checkout provably closes or fails.
      if (checkoutInFlight) {
        setInert(button, CHECKOUT_OPEN_REASON);
        return;
      }
      const problem = configProblem(
        config,
        button.getAttribute('data-checkout-tier'),
        currentPeriod(button),
      );
      if (problem) setInert(button, problem);
      else setReady(button);
    });
  }

  function initCheckout() {
    const buttons = Array.prototype.slice.call(document.querySelectorAll('[data-checkout-tier]'));
    if (buttons.length === 0) return;

    const config = window.PROSO_CHECKOUT_CONFIG;
    refresh(buttons, config);

    buttons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        if (button.getAttribute('aria-disabled') === 'true') {
          const note = noteFor(button);
          if (note) note.hidden = false;
          return;
        }
        if (checkoutInFlight) return;
        holdControls(buttons, config);
        openCheckout(button, config);
      });
    });

    // The pricing toggle rewrites data-billing on the section; a price id that
    // exists monthly but not annually must disable the button when it flips.
    const sections = [];
    buttons.forEach((button) => {
      const section = button.closest('section');
      if (section && sections.indexOf(section) === -1) sections.push(section);
    });

    if (sections.length > 0 && typeof MutationObserver === 'function') {
      const observer = new MutationObserver(() => {
        refresh(buttons, config);
      });
      sections.forEach((section) => {
        observer.observe(section, { attributes: true, attributeFilter: ['data-billing'] });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCheckout);
  } else {
    initCheckout();
  }
})();
