# Data Model: VoxPage Landing Page

**Feature**: `065-landing-page`
**Date**: 2026-02-16

This is a static marketing site with no database. The "data model" here describes the content structures that drive page rendering and must remain consistent across pages.

## Content Entities

### SubscriptionTier

Represents a pricing plan displayed on the pricing page and pricing summary section.

| Field               | Type     | Description                                       |
| ------------------- | -------- | ------------------------------------------------- |
| `name`              | string   | Tier display name (Free, Basic, Pro, Multilingual) |
| `monthlyPrice`      | number   | Monthly price in USD (0, 4.99, 14.99, 19.99)     |
| `annualPricePerMonth` | number | Annual price divided by 12 (0, 3.33, 9.99, 13.33) |
| `annualPriceTotal`  | number   | Annual price total (0, 39.99, 119.99, 159.99)    |
| `browserTTS`        | string   | "Unlimited" for all tiers                         |
| `managedCredits`    | string   | Monthly character allocation or "—"               |
| `premiumVoices`     | string   | Included provider(s) description                  |
| `wordLevelSync`     | boolean  | true for all tiers                                |
| `mp3Export`         | boolean  | Pro and Multilingual only                         |
| `cloudSync`         | boolean  | Pro and Multilingual only                         |
| `pdfReading`        | boolean  | Pro and Multilingual only                         |
| `ctaLabel`          | string   | Button text ("Install Now", "Coming Soon")        |
| `ctaUrl`            | string   | Button link URL                                   |
| `highlighted`       | boolean  | Whether this tier is visually emphasized           |

**Instances**:

| Field               | Free        | Basic            | Pro              | Multilingual          |
| ------------------- | ----------- | ---------------- | ---------------- | --------------------- |
| monthlyPrice        | 0           | 4.99             | 14.99            | 19.99                 |
| annualPricePerMonth | 0           | 3.33             | 9.99             | 13.33                 |
| annualPriceTotal    | 0           | 39.99            | 119.99           | 159.99                |
| managedCredits      | —           | 100K chars/mo    | 300K chars/mo    | 300K chars/mo         |
| premiumVoices       | BYOK only   | OpenAI included  | OpenAI included  | Google Cloud (40+ langs) |
| wordLevelSync       | true        | true             | true             | true                  |
| mp3Export           | false       | false            | true             | true                  |
| cloudSync           | false       | false            | true             | true                  |
| pdfReading          | false       | false            | true             | true                  |
| highlighted         | false       | false            | true             | false                 |
| ctaLabel            | Install Now | Coming Soon      | Coming Soon      | Coming Soon           |

### Feature

Represents a product capability displayed in the features section.

| Field           | Type   | Description                                 |
| --------------- | ------ | ------------------------------------------- |
| `name`          | string | Feature title                               |
| `description`   | string | 1-2 sentence description                    |
| `iconType`      | string | CSS-rendered icon/illustration identifier   |
| `differentiator`| boolean| Whether this is a key competitive advantage |

**Instances**:

1. **Premium AI Voices** — "Choose from OpenAI, ElevenLabs, Groq, or your browser's built-in voices. Bring your own API key or use managed credits." (differentiator: true)
2. **Word-Level Highlighting** — "Follow along as VoxPage highlights each word in real-time. Never lose your place." (differentiator: true)
3. **Smart Text Extraction** — "Automatically detects article content, strips ads and navigation. Or select exactly what you want to hear." (differentiator: false)
4. **Privacy by Design** — "API keys stored locally. No telemetry. No tracking. Open-source code you can audit." (differentiator: true)

### CompetitorComparison

Represents a row in the comparison table.

| Field           | Type   | Description                        |
| --------------- | ------ | ---------------------------------- |
| `category`      | string | Comparison dimension               |
| `voxpage`       | string | VoxPage value                      |
| `speechify`     | string | Speechify value                    |
| `naturalreader` | string | NaturalReader value                |

**Instances** (verified via research R-002):

| Category         | VoxPage                | Speechify         | NaturalReader      |
| ---------------- | ---------------------- | ----------------- | ------------------ |
| Free tier        | Unlimited browser TTS  | Limited           | Limited            |
| BYOK support     | All tiers              | No                | No                 |
| Open source      | Yes (AGPL-3.0)         | No                | No                 |
| Word-level sync  | Free                   | Basic free, advanced paid | Available (paywall unclear) |
| Starting price   | $0                     | $139/yr           | $119/yr            |
| Privacy          | No data collection     | Cloud processing  | Cloud processing   |
| Firefox support  | First-class extension  | Web app only      | Web app only       |

### PricingFAQ

Represents a question/answer in the pricing FAQ.

| Field    | Type   | Description                |
| -------- | ------ | -------------------------- |
| `question` | string | FAQ question text        |
| `answer`   | string | FAQ answer text          |

**Instances**:

1. "What happens when I run out of credits?" — "Your extension falls back to browser's built-in TTS (always unlimited) or you can use your own API keys (BYOK) for free on any tier."
2. "Can I use my own API keys?" — "Yes, on every tier, always free. Bring your own OpenAI, ElevenLabs, Groq, or Cartesia API key and use premium voices without spending credits."
3. "Is there a free trial?" — "The Free tier is unlimited forever — not a trial. Paid tiers include a 7-day free trial."
4. "What's your refund policy?" — "Full refund within 7 days for annual plans. Monthly plans are prorated."
5. "Do unused credits roll over?" — "Pro and Multilingual tiers: up to 100K characters roll over to the next month."

### PageMeta

Represents SEO/meta data for each page.

| Field          | Type   | Description                      |
| -------------- | ------ | -------------------------------- |
| `title`        | string | HTML `<title>` tag              |
| `description`  | string | Meta description (155 chars max) |
| `ogTitle`      | string | Open Graph title                 |
| `ogDescription`| string | Open Graph description           |
| `ogImage`      | string | OG image URL path                |
| `canonicalUrl` | string | Canonical page URL               |

**Instances**:

| Page    | Title                                                   | Description (truncated for readability)                    |
| ------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| index   | VoxPage — Listen to the Web                             | Open-source text-to-speech extension for Firefox with AI voices and word-level highlighting. Free forever. |
| pricing | Pricing — VoxPage                                       | VoxPage pricing plans: Free forever, Basic $4.99/mo, Pro $14.99/mo. BYOK always free. |
| privacy | Privacy Policy — VoxPage                                | VoxPage privacy policy. Zero data collection, zero cookies, API keys stored locally. |
| terms   | Terms of Service — VoxPage                              | VoxPage terms of service covering subscriptions, refunds, and usage. |
