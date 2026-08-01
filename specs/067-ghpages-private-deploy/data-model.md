# Data Model: GitHub Pages from Private Monorepo

**Feature**: 067-ghpages-private-deploy
**Date**: 2026-02-17

## Overview

This feature has no traditional data entities. The "data model" is the deployed site structure and the relationship between source directories and their deployment locations.

## Deployed Site Structure

```
https://phsb5321.github.io/VoxPage/   (deployment root)
├── index.html                          ← packages/site/index.html
├── pricing.html                        ← packages/site/pricing.html
├── privacy.html                        ← packages/site/privacy.html
├── terms.html                          ← packages/site/terms.html
├── robots.txt                          ← packages/site/robots.txt
├── sitemap.xml                         ← packages/site/sitemap.xml
├── assets/                             ← packages/site/assets/
│   ├── css/
│   ├── images/
│   └── fonts/
├── legal/                              ← packages/legal/
│   ├── terms.html
│   ├── README.md
│   └── assets/
│       └── css/
│           └── legal.css
├── updates.json                        ← gh-pages branch (auto-update manifest)
└── releases/                           ← gh-pages branch (signed XPI files)
    └── voxpage-*.xpi
```

## Source → Deployment Mapping

| Source | Deployment Path | Owner Workflow |
| ------ | --------------- | -------------- |
| `packages/site/*` | `/VoxPage/` (root) | deploy-site.yml |
| `packages/legal/*` | `/VoxPage/legal/` | deploy-site.yml |
| `gh-pages:updates.json` | `/VoxPage/updates.json` | release.yml → deploy-site.yml |
| `gh-pages:releases/*` | `/VoxPage/releases/*` | release.yml → deploy-site.yml |

## URL Reference Map

All instances of `voxpage-site` in URLs must be replaced with `VoxPage`:

| File | Meta Type | Old URL | New URL |
| ---- | --------- | ------- | ------- |
| `packages/site/index.html` | og:url | `https://phsb5321.github.io/voxpage-site/` | `https://phsb5321.github.io/VoxPage/` |
| `packages/site/index.html` | canonical | `https://phsb5321.github.io/voxpage-site/` | `https://phsb5321.github.io/VoxPage/` |
| `packages/site/index.html` | JSON-LD url | `https://phsb5321.github.io/voxpage-site/` | `https://phsb5321.github.io/VoxPage/` |
| `packages/site/pricing.html` | og:url | `.../voxpage-site/pricing.html` | `.../VoxPage/pricing.html` |
| `packages/site/pricing.html` | canonical | `.../voxpage-site/pricing.html` | `.../VoxPage/pricing.html` |
| `packages/site/privacy.html` | og:url | `.../voxpage-site/privacy.html` | `.../VoxPage/privacy.html` |
| `packages/site/privacy.html` | canonical | `.../voxpage-site/privacy.html` | `.../VoxPage/privacy.html` |
| `packages/site/terms.html` | og:url | `.../voxpage-site/terms.html` | `.../VoxPage/terms.html` |
| `packages/site/terms.html` | canonical | `.../voxpage-site/terms.html` | `.../VoxPage/terms.html` |
| `packages/site/sitemap.xml` | loc (x4) | `.../voxpage-site/...` | `.../VoxPage/...` |
| `packages/site/robots.txt` | Sitemap | `.../voxpage-site/sitemap.xml` | `.../VoxPage/sitemap.xml` |
| `packages/legal/terms.html` | canonical | `.../voxpage-site/legal/terms.html` | `.../VoxPage/legal/terms.html` |
| `packages/legal/terms.html` | brand href | `.../voxpage-site/` | `.../VoxPage/` |
| `packages/legal/README.md` | deploy ref | `phsb5321/voxpage-site` | `phsb5321/VoxPage` |
| `packages/legal/README.md` | URL | `.../voxpage-site/legal/...` | `.../VoxPage/legal/...` |
| `TERMS_OF_SERVICE.md` | online URL | `.../voxpage-site/legal/...` | `.../VoxPage/legal/...` |
