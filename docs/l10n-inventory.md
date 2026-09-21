# pt-BR Localization Inventory — Extension User-Facing Strings

Inventory of hardcoded user-facing strings for a future pt-BR localization,
taken 21/09/2026 from the four UI surfaces: popup, settings, options logic,
and the reader footer. **The extension currently has zero i18n infrastructure**
(no `_locales/`, no `browser.i18n.*` calls) — every string below is hardcoded
in markup or TypeScript and will need keys before translation.

Line numbers are against the tree as of this inventory; they will drift.

---

## 1. Popup markup — `packages/extension/src/entrypoints/popup/index.html`

| Line | String | Surface | Notes |
|---|---|---|---|
| 6 | `Proso` | `<title>` | Brand — keep, do not translate |
| 16 | `Proso` | header `<h1>` | Brand |
| 21 | `Settings` | button title | |
| 22 | `Open settings` | aria-label | |
| 33 | `Popup navigation` | aria-label (tablist) | |
| 38 / 47 | `Player` | tab aria-label + label | |
| 53 / 62 | `Tools` | tab aria-label + label | |
| 68 / 82 | `Queue` | tab aria-label + label | |
| 95 | `Listen to this page` | first-run title | |
| 96–98 | `Two free ways to start — no account, no licence key.` | first-run subtitle | also re-set from JS (main.ts:643) |
| 99–102 | `Reading sends only the text you ask to hear to the synthesis destination you choose. Nothing is sent until you start, and the public build sends no usage telemetry.` | **data-flow/privacy notice** | PRIORITY — see §6 |
| 106 | `Use a synthesis host you run` | route title | |
| 107–109 | `Point Proso at a synthesis host you operate. The page's text is sent only to the address you enter.` | route desc | privacy-adjacent |
| 115 | `Host address` | label (sr-only) | |
| 117 | `https://your-host:port` | placeholder | example — translate label part if localized |
| 125 | `Connect` | button | also re-set from JS (main.ts:721) |
| 127–129 | `Browser host permissions cover every port on this host. Proso sends the page's text only to the exact address above, and this stays off until you Connect.` | route note | **data-flow/privacy** — PRIORITY; dynamic twin at main.ts:909–910 |
| 147 | `Use your own API key` | route title | |
| 148–150 | `Bring an OpenAI, ElevenLabs, Groq or Cartesia key. The text you ask to hear is sent to that provider; your key is never retained by Proso.` | route desc | **privacy** — PRIORITY |
| 153 | `API key provider` | aria-label (select) | |
| 154–157 | `OpenAI` / `ElevenLabs` / `Groq` / `Cartesia` | option labels | brand names — keep |
| 163 | `API key` | placeholder | |
| 166 | `API key` | aria-label | |
| 171 | `Use this key` | button | |
| 189 | `Open the source tab` | button | |
| 191 | `Keep listening when I leave this page` | aria-label | |
| 192 | `Keep listening when I leave this page:` + `Off` | button text + state | `On`/`Off` swapped from JS (main.ts:399) |
| 193 | `Keep the browser open. Text continues to be sent to your synthesis destination and may use credits. Document titles appear in the toolbar.` | hint | **data-flow** — PRIORITY-adjacent |
| 201 | `Ready` | status text | also re-set from JS |
| 212 | `Grant access` | button | also re-set from JS (main.ts:871/909) |
| 217 | `Word highlighting: approximate` | timing note | JS twin main.ts:293 |
| 228 | `Playback progress` | aria-label (progressbar) | |
| 240 | `Seek position` | aria-label (slider) | |
| 249–250 | `Previous paragraph` | title + aria-label | |
| 262–263 | `Play` | title + aria-label | JS swaps to `Pause`/`Resume` |
| 278–279 | `Next paragraph` | title + aria-label | |
| 291–292 | `Stop playback` | title + aria-label | |
| 306 | `Speed:` (+ `1.0x` value) | label | `X.Xx` format — pt-BR uses `1,0x` decimal comma |
| 314 | `Playback speed` | aria-label (slider) | |
| 321 | `Estimated Cost:` | label | |
| 325 | `Cache Savings:` + `$0.00 (0%)` | label + default value | currency — see §7 notes |
| 333 | `Credits:` | label | |
| 353–357 | `Image Text (OCR)` | tool title | |
| 358 | `Extract and read text from images on the page` | tool desc | |
| 360–361 | `Read text from screenshot` | title + aria-label | |
| 363 | `Capture & Read` | button | |
| 368 | `Extracted Text` | ocr title | |
| 373–374 | `Read extracted text` | title + aria-label | |
| 384–385 | `Close` / `Close OCR result` | title + aria-label | |
| 394–398 | `Highlights` | section title | |
| 405 | `0 highlights on this page` | count pattern `{n} highlights on this page` | plural |
| 415 | `Selected:` (+ quoted preview) | selection label | |
| 419–423 | `Yellow` / `Green` / `Blue` / `Pink` / `Purple` (+ aria `{Color} highlight`) | color title + aria | |
| 428–429 | `Create highlight from selection` / `Create highlight` | title + aria-label | |
| 431 | `Highlight` | button | |
| 436 | `Select text on the page to create a highlight` | empty-selection msg | |
| 443–447 | `Export Audio` | section title | |
| 448 | `Download this article as an MP3 file` | desc | |
| 453–454 | `Download article as MP3` | title + aria-label | |
| 456 | `Download MP3` | button | also re-set from JS (main.ts:1081/1228) |
| 461 | `Preparing...` | progress text | JS twin main.ts:1150 |
| 465–466 | `Cancel export` | title + aria-label | |
| 481 | `Reading Queue` | heading | |
| 482 | `0 items` | count pattern `{n} item(s)` | plural; JS twin main.ts:1345 |
| 488–489 | `Add current page to reading queue` / `Add to reading queue` | title + aria-label | |
| 495 | `Add Current Page` | button | JS swaps `Adding...`/`Added!`/`Add to Queue`/`Failed` |
| 499 | `Queue is empty. Add articles to listen later.` | empty msg | |
| 506–507 | `Play queue from start` / `Play queue` | title + aria-label | |
| 512 | `Play Queue` | button | |
| 517–518 | `Clear completed items` | title + aria-label | |
| 519 | `Clear Completed` | button | |
| 529 | `Help` | footer link | opens GitHub README |
| 530 | `v1.0.0` | version pattern `v{version}` | keep `v` prefix convention |

## 2. Popup logic — `packages/extension/src/entrypoints/popup/main.ts`

| Line | String | Surface | Notes |
|---|---|---|---|
| 236–240 | `Ready` / `Loading...` / `Playing` / `Paused` / `Error` | status labels | |
| 254–255, 259–260 | `Pause` / `Play` | aria-label + title (play/pause swap) | |
| 293 | `Word highlighting: provider timed` / `Word highlighting: approximate` | timing note | |
| 329–332 | `Playing — reading view closed` / `Playing in this tab` / `Playing in another tab` | live status | |
| 341 | `Untitled document` | fallback doc title | |
| 346–347 | `Resume` | aria-label + title | |
| 399 | `On` / `Off` | background-playback state | |
| 410 | `Could not save. Try again.` | feedback error | |
| 518 | `Could not check the current reading. Try again.` | status error | |
| 529 | `Stop the current reading before reading this page.` | status error | |
| 549 | `Playback failed` | error fallback | shared with playback-failure.ts:14 |
| 643 | `Two free ways to start — no account, no licence key.` | first-run subtitle (dynamic reset) | dup of index.html:96 |
| 690 | `` `Could not activate ${provider}.` `` | error | interpolation |
| 715 / 721 | `Connecting…` / `Connect` | button pending / restore | |
| 734 | `Contacting the host and asking which voices it has…` | route status | |
| 753 | `` `The host is ready, but Proso could not activate it. ${message}` `` | route error | |
| 760 | `` `Connected — ${n} voice(s) found. Starting playback…` `` | route ok | plural `voice(s)` |
| 776 | `Checking the key…` | route status | |
| 792 | `` `The ${provider} key was rejected — nothing was saved. Check it and try again.` `` | route error | |
| 794 | `` `The ${provider} key was verified, but Proso could not activate it, so it was not saved. ${msg}` `` | route error | |
| 795 | `` `The ${provider} key could not be verified, so it was not saved. ${msg}` `` | route error | |
| 801 | `` `Key saved — ${provider} is free on every tier. Starting playback…` `` | route ok | |
| 833 | `Choose a free route below to start listening.` | first-run preamble | |
| 846 | `Retry` + `The local host stopped responding. Playback paused.` | fix action + reason | |
| 849 | `Edit key` | fix action button | |
| 871 | `Grant access` | fix action reset | dup of index.html:212 |
| 901 | `The saved host address cannot receive browser access. Enter it again below.` | preamble | |
| 909–910 | `Grant access` + `` `Browser host permissions cover every port on this host. Proso sends page text only to ${origin}.` `` | fix action + reason | **privacy** — PRIORITY |
| 923 | `The saved host address cannot receive browser access. Enter it again in settings.` | grant error | |
| 930 | `Access was not granted — the local host route stays disabled.` | grant error | |
| 1081 / 1228 | `Download MP3` | button restore | dup of index.html:456 |
| 1100 | `Export timed out` | progress text | |
| 1127 | `Complete! Starting download...` | progress text | |
| 1139 | `` `Error: ${response.error \|\| 'Unknown error'}` `` | progress error | |
| 1147 | `` `Generating audio... ${current}/${total}` `` | progress text | |
| 1149 | `Encoding MP3...` | progress text | |
| 1150 | `Preparing...` | progress text | dup of index.html:461 |
| 1184 / 1222 | `Starting...` | button + progress | |
| 1189 | `No active tab` | thrown error (surfaces in UI) | |
| 1198 | `No content to export` | thrown error (surfaces in UI) | |
| 1217 | `Failed to start export` | thrown error (surfaces in UI) | |
| 1226 | `Export failed` | button error fallback | |
| 1333–1334 | `Remove from queue` | title + aria-label | |
| 1335 | `×` | remove glyph | symbol — likely keep |
| 1349 | `'...'` truncation suffix | queue title ellipsis | |
| 1379 | `Adding...` | button pending | |
| 1384 | `Cannot add this page to queue` | thrown error (surfaces in UI) | |
| 1414 | `Failed to add to queue` | thrown error (surfaces in UI) | |
| 1418 | `Added!` | button success | |
| 1422 / 1429 | `Add to Queue` / `Failed` | button restore / error | |
| 1509–1513 | `Free` / `<$0.01` / `` `$${cost.toFixed(2)}` `` | cost format | currency + decimal — pt-BR needs `R$` decision and comma |
| 1516 | `$0.00 (0%)` | savings format | |
| 1690 | `Credits exhausted — upgrade to continue` | credits warning | |
| 1694 | `` `Low credits — ${n} remaining` `` | credits warning | |
| 1698 | `` `${n} credits remaining` `` | credits info | plural |
| 1776 | `Edit your provider key below to start listening.` | first-run preamble | |

`popup/playback-failure.ts:14` — `Playback failed` (fallback status).
`popup/popup-tabs.ts` — no user-facing strings.

## 3. Settings markup — `packages/extension/src/entrypoints/settings.html`

| Line | String | Surface | Notes |
|---|---|---|---|
| 7 / 43 | `Proso Settings` | `<title>` + header | |
| 36 | `Skip to main content` | skip link | a11y |
| 47 | `Server connection status` | aria-label | |
| 49 | `Not configured` | status text | JS twins controller.ts:2266–2317 |
| 50 | `Refresh server status` / `Refresh` | aria-label + title | |
| 66 | `Theme` | label (sr-only) | |
| 67 | `Select theme` | aria-label | |
| 68–70 | `System` / `Light` / `Dark` | theme options | |
| 76 | `Settings navigation` | aria-label (nav) | |
| 84 / 98 / 106 / 119 / 128 / 137 / 146 | `Quick Settings` / `Appearance` / `Audio Cache` / `Reading Queue` / `Shortcuts` / `Paid account` / `Developer` | sidebar links | JS twins: SECTION_DISPLAY_NAMES controller.ts:1930–1935, sidebar.ts:32–38 (latent) |
| 152 | `Quick Settings` | section title | |
| 153–155 | `Quickly adjust your most-used settings. Changes are saved automatically.` | section desc | |
| 167 | `Reset Quick Settings to defaults` | aria-label | |
| 171 | `Reset to Defaults` | button | repeated at 379, 545 |
| 178 | `Provider` | label | |
| 180–184 | `ElevenLabs` / `OpenAI` / `Groq (English only)` / `Cartesia (English only)` / `Local synthesis host` | provider options | |
| 185 | `Select your preferred text-to-speech provider` | hint | |
| 190 / 192 / 193 | `Voice` / `Default Voice` / `Voice options vary by provider` | label / option / hint | `Default Voice` JS twin controller.ts:314, 695 |
| 198 / 201 | `Speed` / `Adjust playback speed (0.5x - 2.0x)` | label / hint | decimal comma applies |
| 208–210 | `Local synthesis host` | section title | |
| 215–219 | `Use a speech synthesizer on your own network — no account, no license key, no provider key. Your Orange Pi (or any host that speaks the same API) is the first instance. Reading works for Portuguese and English articles.` | section desc | |
| 220–222 | `Where page text goes: the page's text is sent only to the host address you enter here, and nowhere else. It is never sent to the Proso servers.` | **data-flow/privacy notice** | PRIORITY — see §6 |
| 225–227 | `Enable the local synthesis host` | checkbox label | |
| 230 | `Host address` | label | |
| 231 | `http://127.0.0.1:5301` | placeholder | example |
| 232 | `The address must start with https:// (or http:// for localhost).` | hint | |
| 246 / 247 / 248 | `Voice` / `Automatic (by article language)` / ``Click "Test connection" to load the voices the host publishes.`` | label / option / hint | `Automatic…` JS twin controller.ts:594 |
| 254 | `Test connection` | button | referenced by name in hint + controller.ts:391 |
| 261–263 | `Pronunciation` | section title | |
| 266–268 | `Teach Proso how to say names, acronyms and terms. Works with every voice — managed, your own keys, or a local host.` | section desc | |
| 271–272 | `Apply my pronunciation rules` | checkbox label | |
| 273–275 | `Rules — one per line, printed text => spoken text` | label | format spec — translate carefully |
| 289 | `INSS => I N S S` / `OMS => Organização Mundial da Saúde` | placeholder | already pt-BR-flavored examples |
| 290 | `Word rules match whole words (case-insensitive). Leave the box empty to remove every rule.` | hint | |
| 284–288 | `Paid account` | section title | |
| 294–297 | `A licence key unlocks synthesis on Proso's managed servers and the credits that come with your plan.` | section desc | |
| 298–300 | `You do not need one to read. A synthesis host on your own network and your own provider key both work with no account and no licence key.` | free note | |
| 329 | `Licence key` | label | |
| 331 | `PROSO-…` | placeholder | format example — keep |
| 332 | `Toggle licence key visibility` | aria-label | |
| 333–336 | `Stored in this browser and sent only to the Proso server, as the key that identifies your plan. After a reload the field stays empty and only a masked suffix is shown when it is safe to reveal one.` | hint | **privacy** — PRIORITY-adjacent |
| 339 | `Save & validate` | button | JS twin license-settings.ts:147 |
| 352–356 | `Appearance` | section title | |
| 375 | `Reset Appearance settings to defaults` | aria-label | |
| 388 | `Highlight text while reading` | toggle label | |
| 396 | `Auto-scroll to current paragraph` | toggle label | |
| 404 | `Keep listening when I leave this page` | toggle label | dup of popup toggle |
| 405 | `Playback continues when you switch tabs or windows, follow a link or reload — as long as the browser stays open. Leave it off to end the session when you leave the page, so Play is ready for the next one. While it plays on, prefetch may keep sending text of the current document to your selected voice and use credits.` | hint | **data-flow** — PRIORITY-adjacent |
| 413 | `Show cost estimates in popup` | toggle label | |
| 414 | `Display estimated API costs and cache savings when using paid TTS providers` | hint | |
| 421–425 | `Audio Cache` | section title | |
| 426–428 | `Proso caches generated audio to reduce API costs and improve playback performance. Cached audio is stored locally and automatically managed.` | section desc | |
| 439 / 443 / 447 / 451 | `Entries` / `Size` / `Hit Rate` / `Savings` | stat labels | |
| 441 / 445 / 449 / 453 | `--`, `-- / -- MB`, `--%`, `$0.00` | stat placeholders | number/currency formats |
| 459 | `0% used` | usage label | JS twin controller.ts:2104 |
| 464–470 | `Clear Cache` | button | also modal confirmText controller.ts:2128 |
| 471–477 | `Refresh` | button | |
| 480–482 | `Cache is automatically managed. Old entries are removed when storage limits are reached.` | hint | |
| 486–492 | `Highlights` | section title | |
| 493–495 | `Text you highlight while reading is stored in this browser and nowhere else. Exporting writes all of it to one file so another tool can read it.` | section desc | **privacy** — PRIORITY-adjacent |
| 499–503 | `Export Highlights` | button | |
| 506–508 | `Saved to your downloads folder as proso-highlights.json, replacing any previous export. Each entry holds the page address, the quoted text with the words either side of it, your note, and when you made it.` | hint | filename `proso-highlights.json` is code (HIGHLIGHT_EXPORT_FILENAME) — keep |
| 511–517 | `Reading Queue` | section title | |
| 541 | `Reset Reading Queue settings to defaults` | aria-label | |
| 547–549 | `Configure your reading queue behavior. Save articles for later and listen to them in sequence.` | section desc | |
| 558 / 559 | `Auto-play next article` / `Automatically start the next article when the current one finishes` | toggle + hint | |
| 564 | `Maximum Queue Size` | label | |
| 567–571 | `100 items` / `200 items` / `300 items (Default)` / `500 items` | size options | plural |
| 572 | `Oldest archived items are removed when the queue exceeds this limit` | hint | |
| 578 / 579 | `Save reading progress` / `Remember where you left off in each article` | toggle + hint | |
| 583–589 | `Clear Completed` / `Clear All` | buttons | JS twins controller.ts:1877, 1848+ |
| 594–601 | `Keyboard Shortcuts` | section title | |
| 603 | `Use these shortcuts to control playback:` | desc | |
| 613 / 617 / 621 / 625 | `Play/Pause` / `Stop` / `Next paragraph` / `Previous paragraph` | shortcut names | `Alt`/`P` kbd names stay |
| 634–641 | `Developer Settings` | section title | |
| 642–644 | `Configure developer options and privacy settings.` | section desc | |
| 653 | `API Keys (BYOK)` | subsection title | |
| 654–656 | `Configure your own API keys for direct provider access. Keys are stored locally and never sent anywhere except to the respective API providers.` | desc | **privacy** — PRIORITY-adjacent |
| 662 / 685 / 708 / 731 | `ElevenLabs` / `OpenAI` / `Groq` / `Cartesia` | provider badges | brand names |
| 663 / 686 / 709 / 732 | `Premium voice cloning and multilingual support` / `GPT-4o TTS with strong multilingual coverage` / `Ultra-fast open-model TTS (English only)` / `Low-latency neural voice synthesis (English only)` | provider descs | "(English only)" repeated |
| 666 / 689 / 712 / 735 | `xi-...` / `sk-...` / `gsk_...` / `sk_...` | key placeholders | format examples — keep |
| 667 / 690 / 713 / 736 | `Toggle API key visibility` | aria-label ×4 | |
| 673–674 etc. | `Test` / `Save` | buttons ×4 | JS twins controller.ts:1343, 1390 |
| 676 / 699 / 722 / 745 | `Get API Key` | docs links ×4 | |
| 760 / 761 | `Send diagnostic logs to help fix issues` / `Logs are sent to our secure server and contain no personal data.` | toggle + hint | **privacy** — PRIORITY-adjacent |
| 767 | `Log Buffer` | subsection title | |
| 770–797 | `View Logs` / `Flush Now` / `Clear` / `Export JSON` / `Copy Logs` | log buttons | |
| 802 | `Save Settings` | button | |
| 828 | `Proso v1.0.0 - AI-Powered Page Reader` | footer tagline | version interpolated at build? — currently literal |
| 830–834 | `GitHub` / `Report Issue` / `Support Proso` | footer links | `Support Proso` needs pt-BR copy |

## 4. Options logic — `packages/extension/src/entrypoints/options/`

### `controller.ts`

| Line | String | Surface | Notes |
|---|---|---|---|
| 314 / 695 | `Default Voice` | voice option | dup of settings.html:192 |
| 377–378 | `` `${n} rule(s) saved.` `` | pronunciation status (load) | plural |
| 391 | `Needs permission — enable the host or click "Test connection" to grant access.` | local-host status | references another button's label |
| 484 | `Enable requires a valid HTTPS address, or HTTP on localhost, 127.0.0.1, or [::1], with no path.` | local-host error | |
| 485 | `Finish entering a valid address; the current saved route is unchanged.` | local-host status | |
| 497 | `Host permission was not granted — the local route stays disabled.` | local-host error | |
| 502 | `` `Browser host access covers every port; Proso uses only ${origin}.` `` | local-host status | **privacy** — PRIORITY-adjacent |
| 536 | `The current host stays active. Test this address or toggle Enable to apply it.` | local-host status | |
| 559 | `Enter a valid HTTPS address, or HTTP on localhost, 127.0.0.1, or [::1], with no path.` | local-host error | near-dup of 484 |
| 562 | `Testing…` | local-host status | |
| 573 | `` `Host answered ${status} — check the address.` `` | local-host error | |
| 581 | `Host is not ready yet — try again shortly.` | local-host status | |
| 594 | `Automatic (by article language)` | voice option | dup of settings.html:247 |
| 602 | `` `${voice.id} (${voice.language})` `` | voice option label | |
| 608 | `` `Connected — ${n} voice(s) found.` `` | local-host ok | plural; near-dup of popup main.ts:760 |
| 611 | `` `Connection failed: ${message}` `` | local-host error | |
| 736 / 745 / 771 | `Provider updated` / `Voice updated` / `Speed updated` | toasts | |
| 788 | `` `Failed to save ${key}` `` | toast error | key names leak into copy — needs mapping |
| 1133 | `Text highlighting enabled` / `Text highlighting disabled` | toasts | |
| 1143 | `Auto-scroll enabled` / `Auto-scroll disabled` | toasts | |
| 1151 | `Background playback enabled` / `Leaving a page will end playback` | toasts | asymmetric pair — translate meaning, not words |
| 1161 | `Cost estimates enabled` / `Cost estimates hidden` | toasts | |
| 1199–1201 | `system theme` / `light theme` / `dark theme` | toast fragment `` `Switched to ${label}` `` | lower-case mid-sentence — pt-BR word order |
| 1286–1287 | `No API key entered` / `Please enter an API key first` | card status + toast | |
| 1293 / 1295 | `Testing...` | button + status | |
| 1311 | `` `✓ Valid${latency}` `` | card status | ✓ symbol; latency ` (NNNms)` |
| 1313 | `` `${Provider} API key is valid` `` | toast | provider names from capitalizeProvider (brand) |
| 1319 / 1331 | `` `✗ ${message}` `` / `Test failed` | card status | |
| 1343 | `Test` | button restore | dup of settings.html |
| 1366 | `Saving...` | button pending | |
| 1371–1372 | `✓ Saved` / `` `${Provider} API key saved` `` | card status + toast | |
| 1384 / 1390 | `Save failed` / `Save` | error fallback / button restore | |
| 1444–1446 | `No pronunciation rules set.` / `` `${n} rule(s) saved.` `` | pronunciation status (save) | plural |
| 1477 / 1480 / 1568 / 1571 / 1835 / 1838 | `Settings saved!` / `Error saving settings` | save status (×3 contexts) | |
| 1585 | `Loading logs...` | log viewer status | |
| 1596 | `No logs in buffer` | log viewer status | |
| 1616 | `` `${n} logs in buffer (${bytes} bytes)` `` | log viewer status | |
| 1618 | `Failed to load logs` | log viewer error | |
| 1621 etc. | `` `Error: ${message}` `` / `Unknown error` | log viewer errors (repeated) | |
| 1630 | `Flushing logs...` | log viewer status | |
| 1636 | `Logs flushed successfully` | log viewer status | |
| 1641 / 1646 | `Unknown error` / `` `Flush failed: ${msg}` `` | log viewer error | |
| 1661–1663 | `Clear buffered logs` / `Are you sure you want to clear all buffered logs? This cannot be undone.` / `Clear logs` | confirm dialog title / body / confirm | |
| 1674 | `Logs cleared` | log viewer status | |
| 1678 | `` `Clear failed: ${err \|\| 'Unknown error'}` `` | log viewer error | |
| 1703 | `` `Exported ${n} logs` `` | log viewer status | |
| 1717 | `No logs to export` | log viewer status | |
| 1746 | `` `Copied ${n} logs to clipboard` `` | log viewer status | |
| 1748 | `No logs to copy` | log viewer status | |
| 1752 | `` `Error copying logs: ${msg}` `` | log viewer error | |
| 1848 | `Clearing completed...` | queue status | |
| 1857 | `` `Cleared ${n} items` `` | queue status | plural |
| 1859 / 1895 | `` `${err \|\| 'Failed to clear'}` `` | queue error | |
| 1874–1877 | `Clear reading queue` / `Are you sure you want to clear all items from the reading queue? This cannot be undone.` / `Clear all` | confirm dialog | |
| 1884 | `Clearing all...` | queue status | |
| 1930–1935 | `Quick Settings` / `Appearance` / `Reading Queue` / `Developer Settings` | reset-dialog section names | |
| 1964–1967 | `Reset Settings` / `` `Are you sure you want to reset ${section} to defaults? This action cannot be undone.` `` / `Reset` / `Cancel` | reset confirm dialog | |
| 1977 | `Reset failed` | thrown error | |
| 1984 | `` `${section} reset to defaults` `` | toast | |
| 2125–2129 | `Clear Audio Cache` / `This will delete all cached audio. You will need to regenerate audio for pages you revisit. This cannot be undone.` / `Clear Cache` / `Cancel` | cache confirm dialog | |
| 2137 | `Failed to clear cache` | thrown error | |
| 2143 | `Audio cache cleared` | toast | |
| 2189 | `Exporting…` | highlights status | |
| 2198 | `Could not read stored highlights` | thrown error | |
| 2207 | `` `${n} highlight(s) → ${filename}` `` | highlights status | plural; filename stays |
| 2208 | `` `Exported ${n} highlight(s)` `` | toast | plural |
| 2210 / 2214 | `Export failed` / `` `Export failed: ${msg}` `` | error + toast | |
| 2266 | `Local host` | server-status label | |
| 2269 | `Local host not configured` | server-status label | |
| 2271 / 2289 | `` `URL: ${url}` `` | server detail | `URL:` prefix |
| 2283 | `Not configured` | server-status label | dup of settings.html:49 |
| 2288 | `Checking...` | server-status label | |
| 2300 / 2315 | `Disconnected` | server-status label | |
| 2301 | `` `Error: HTTP ${status}` `` | server detail | |
| 2307 | `Connected` | server-status label | |
| 2309 / 2312 | `` `Version: ${v}` `` / `` `Uptime: ${...}` `` | server detail | |
| 2317 | `` `Error: ${msg \|\| 'Timeout'}` `` | server detail | |
| 2337–2342 | `s` / `m` / `h` / `d` | uptime units | pt-BR: `s`/`min`/`h`/`d` |

### `license-settings.ts`

| Line | String | Surface | Notes |
|---|---|---|---|
| 71 | `Licence key saved` | toast | |
| 93 / 102 | `The licence status could not be read from the extension.` | status error | |
| 115 / 116 | `Validating…` | button + status | |
| 125 / 142 | `The extension did not answer the licence check.` | status error | |
| 147 | `Save & validate` | button restore | dup of settings.html:339 |
| 101 / 140 | `Error loading licence status` / `Error validating licence key` | log-only (not UI) | excluded from keying; kept here for completeness |

### `pronunciation-rules.ts` (parse errors rendered in settings status line)

| Line | String | Surface | Notes |
|---|---|---|---|
| 52 | `` `Line ${n}: the rules list is full (${max}).` `` | inline error | |
| 57 | `` `Line ${n}: expected "printed text => spoken text".` `` | inline error | format spec inside message |
| 63 | `` `Line ${n}: both sides of "=>" are required.` `` | inline error | |
| 68 | `` `Line ${n}: "${match}…" is too long to match (max ${max}).` `` | inline error | |
| 74 | `` `Line ${n}: the spoken text is too long (max ${max}).` `` | inline error | |
| 79 | `` `Line ${n}: the spoken text is identical to the printed text.` `` | inline error | |

### `components/toast.ts`, `components/modal.ts`, `components/sidebar.ts`

| Line | String | Surface | Notes |
|---|---|---|---|
| toast.ts:52 | `Notifications` | aria-label (region) | |
| toast.ts:108 | `Dismiss notification` | aria-label | |
| toast.ts:114 / 92–98 | `×`, `✓`, `✗`, `⚠`, `ℹ` | glyphs | symbols — likely keep |
| modal.ts:35–36 | `Confirm` / `Cancel` | default button labels | `Cancel` also passed explicitly (controller.ts:1967, 2129) |
| modal.ts:135 | `Processing...` | confirm button pending | |
| sidebar.ts:32–38 | `Quick Settings` / `API Keys` / `Appearance` / `Reading Queue` / `Highlights` / `Shortcuts` / `Developer` | DEFAULT_SECTIONS labels | **latent**: `createSidebar` is not wired on the live page (static HTML sidebar is used); key anyway for safety |
| sidebar.ts:56 | `Settings navigation` | aria-label | dup of settings.html:76 |

## 5. Reader footer — `packages/extension/src/entrypoints/content.ts` → `utils/content/sticky-footer.ts`

content.ts wires the footer; the strings physically live in
`packages/extension/src/utils/content/sticky-footer.ts` (Shadow-DOM UI).

### In `content.ts` itself

| Line | String | Surface | Notes |
|---|---|---|---|
| 902 | `Add a note to this highlight:` | native `prompt()` text | also: native prompt UI is browser chrome — consider replacing before l10n |
| 1123 | `Article extraction failed` | error payload (surfaces in popup export error) | |
| 1375 / 1384 | `Manager not initialized` / `No text selected` | error payloads (highlight flow) | may surface via future UI |

### In `utils/content/sticky-footer.ts`

| Line | String | Surface | Notes |
|---|---|---|---|
| 177 | `Default` | voice fallback label | |
| 718 | `Proso playback controls` | aria-label (toolbar) | |
| 743 | `Previous paragraph` | aria-label | dup of popup |
| 752 / 1201 | `Pause` / `Play` | aria-label (swap) | |
| 763 | `Next paragraph` | aria-label | |
| 784 | `Playback progress` | aria-label (slider) | |
| 788 / 1132 | `` `${n}% complete` `` | aria-valuetext | |
| 815 / 1144 | `` `Playback speed ${n}x` `` | aria-label + button text | decimal comma applies |
| 825 | `Select playback speed` | aria-label (listbox) | |
| 836 | `` `${n}x` `` | speed options | |
| 848 / 1171 | `` `Language: ${'Auto-detected'} ${CODE}` `` | aria-label | |
| 891 | `Select language` | aria-label (listbox) | |
| 902 | `Auto-detect` | option | |
| 916 | `` `${languageName} (${CODE})` `` | language options | names from `utils/language/codes.ts` (outside scope — see §8) |
| 931 / 1693 | `` `Voice: ${label}` `` | aria-label | |
| 962 | `Select voice` | aria-label (listbox) | |
| 972 | `Current position` | aria-label | |
| 985 | `Close player` | aria-label | |
| 1204 | `Playing` / `Paused` | live-region announce | |
| 1269 / 1270 | `Dismiss` / `Dismiss error` | error button + aria-label | |
| 1283 | `` `Error: ${message}` `` | live-region announce | |
| 1408 | `` `${current}/${total}` `` | position indicator | numeric — locale-safe |
| 1417 | `` `Paragraph ${x} of ${y}` `` | position announce | pt-BR word order: `Parágrafo {x} de {y}` fits |
| 1550 | `` `Speed ${n}x` `` | announce | |
| 1574 | `Player minimized` / `Player expanded` | announce | |
| 1582 | `Added to queue` | announce | |
| 1732 | `No voices available` / `Loading voices…` | voice dropdown status | |
| 1763 | `` `Voice ${name}` `` | announce | |

---

## 6. Key first — priority order

The **data-flow/privacy notices** are the priority. They are trust- and
consent-bearing copy (LGPD-sensitive), they are the first thing a new reader
sees, and a mistranslation there misrepresents where text and keys go:

1. **First-run data disclosure** — `popup/index.html:99–102` (`data-testid="popup-first-run-data-disclosure"`). The canonical "what leaves your browser" statement.
2. **Host-route privacy notes** — `popup/index.html:127–129` + dynamic twin `popup/main.ts:909–910` + settings twin `options/controller.ts:502`; plus the "Where page text goes" block `settings.html:220–222`.
3. **BYOK privacy copy** — `popup/index.html:148–150` ("your key is never retained by Proso") + `settings.html:654–656` (BYOK card: keys stored locally, sent only to providers) + licence-key storage hint `settings.html:333–336`.
4. **Telemetry/logging consent** — `settings.html:760–761` ("Logs are sent to our secure server and contain no personal data") — a consent claim that must be exactly right.
5. **Background-playback data-flow hints** — `popup/index.html:193` + `settings.html:405` (text keeps being sent / credits while it plays on).

After those, key by reader exposure: popup chrome (§1–2), reader footer (§5),
settings static copy (§3), then the long tail of status/toast messages (§4).

Practical note for keying: several strings exist as HTML/JS **duplicate pairs**
(first-run subtitle, `Connect`, `Download MP3`, `Preparing...`, `Ready`,
`Default Voice`, `Automatic (by article language)`, `Test`, `Save`, `Cancel`,
`Not configured`). One key each, set as element text on load — the JS twin is
then deleted rather than keyed twice.

## 7. Cross-cutting format decisions (not plain strings, but blocking)

- **Currency**: popup cost/savings/cache-savings use `$X.XX` (`main.ts:1509–1516`, `controller.ts:2101`). pt-BR needs a `R$` vs `US$` decision + decimal comma.
- **Decimals**: speed `1.0x` appears in popup + settings (`main.ts:305`, `controller.ts:669, 757, 833`). pt-BR: `1,0x`.
- **Plurals**: hand-rolled `rule(s)`, `item(s)`, `highlight(s)`, `voice(s)`, `logs`, `items` — no plural framework; pick keys now or migrate to `Intl.PluralRules`.
- **Interpolations**: provider names, origins, counts, error sub-messages are interpolated mid-sentence — message-format placeholders (`{provider}` etc.) required, not concatenation.
- **Asymmetric toast pairs** (`Background playback enabled` / `Leaving a page will end playback`) must be keyed as independent messages.

## 8. Explicitly NOT covered

- **`utils/content/sticky-footer.ts`** is inventoried above (it *is* the reader footer) but note it lives outside `entrypoints/`; deeper `utils/` was not swept.
- **`utils/language/codes.ts`** — `SUPPORTED_LANGUAGES` display names (30 language names) rendered in the footer language dropdown. Data, not entrypoint code; needs its own keying pass.
- **`utils/license/license-status.ts`** — `describeLicenseStatus` / `describeLicenseAccepted` / `describeLicenseFailure` produce user-visible settings status copy; not read for this inventory.
- **`utils/first-run.ts`** and **`utils/options/api-key-tester.ts`** — validation/error message text that flows into popup/settings status lines (e.g. `result.message`, `result.error.message` interpolated above); source strings not enumerated.
- **Error messages from the background script / server** surfaced verbatim in popup/footer error regions (e.g. 402 entitlement text, provider errors) — they cross package boundaries (`shared/`, `server/`) and were out of scope.
- **`background.ts`, `offscreen/`, other content-script UI** (e.g. highlight context-menu labels if any live outside content.ts's prompt) — not swept.
- **`manifest.json` / store listing** (extension name, description) and any future `_locales/` metadata.
- **`packages/site`, `packages/server`, `packages/shared`** — landing page, server-rendered/API error copy.
- **Tests, specs, and fixtures** containing English assertions/strings.
- **Native browser chrome** shown by `prompt()`/`alert()`-style dialogs (content.ts:902) — the wrapper text is ours, the dialog furniture is not translatable by us.
