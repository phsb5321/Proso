/**
 * Proso checkout configuration.
 *
 * This is the ONE place Paddle values are supplied. Nothing here is a secret:
 * the client-side token and the price ids are published to every visitor by
 * design. The Paddle API key and the webhook secret are server-side and must
 * never appear in this file.
 *
 * Every value below is empty on purpose. An empty or malformed value does not
 * degrade silently — the buy buttons render disabled and state which field is
 * missing (see assets/js/checkout.js). Do not invent ids to "make it work".
 *
 * WHAT A HUMAN MUST FILL IN
 *
 *   environment  'sandbox' while testing against Paddle's sandbox account,
 *                'production' once the live account is verified.
 *
 *   clientToken  Paddle > Developer tools > Authentication > Client-side
 *                tokens. Starts with `test_` (sandbox) or `live_`
 *                (production) and must match `environment`.
 *
 *   prices.*     Paddle > Catalog > Products > (product) > Prices. One id per
 *                tier and billing period, each starting with `pri_`.
 *
 * TIER MAPPING — read this before pasting anything.
 *
 * The keys below are Proso's server-side tier names, not the display names on
 * the pricing page:
 *
 *   config key    pricing page card   price       credits per month
 *   ----------    -----------------   ---------   -----------------
 *   pro           "Basic"             $4.99/mo    500,000
 *                                     $39.99/yr
 *   enterprise    "Pro"               $14.99/mo   2,000,000
 *                                     $119.99/yr
 *
 * The tier travels to Paddle as `custom_data.tier`, but it is diagnostic only:
 * this file is served to every visitor and its contents are trivially editable
 * in a browser, so the server derives entitlement from the Paddle PRICE ID it
 * receives, never from what the page claimed. A price id it does not recognise
 * is a hard failure there, not a default.
 *
 * That is exactly why the mapping below still has to be right: pasting the
 * $4.99 price id under `enterprise` sells the Pro card for Basic money.
 *
 * The "Multilingual" card has no server-side tier and therefore no entry here;
 * it stays unpurchasable until one exists.
 */
window.PROSO_CHECKOUT_CONFIG = {
  environment: 'sandbox',
  clientToken: '',
  apiBaseUrl: 'https://api.proso.com.br',
  prices: {
    pro: { monthly: '', yearly: '' },
    enterprise: { monthly: '', yearly: '' },
  },
};
