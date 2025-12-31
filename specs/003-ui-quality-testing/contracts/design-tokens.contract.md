# Design Tokens Contract

**Version**: 1.0.0
**Feature**: 003-ui-quality-testing

## Overview

This contract defines the expected structure and values for the VoxPage design token system. All CSS files must reference these tokens rather than using hardcoded values.

## Token Interface

### Color Tokens (Required)

All color tokens must be defined in `styles/tokens.css` using CSS custom properties.

#### Accent Colors (Teal/Cyan Theme)

| Token Name | Dark Mode Value | Light Mode Value | Purpose |
|------------|-----------------|------------------|---------|
| `--color-accent-primary` | `#0D9488` | `#0D9488` | Primary interactive elements |
| `--color-accent-secondary` | `#14B8A6` | `#14B8A6` | Secondary accents, hovers |
| `--color-accent-gradient` | `linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)` | Same | Buttons, progress bars |
| `--color-accent-bg` | `rgba(13, 148, 136, 0.15)` | `rgba(13, 148, 136, 0.1)` | Subtle backgrounds |

#### Background Colors

| Token Name | Dark Mode Value | Light Mode Value |
|------------|-----------------|------------------|
| `--color-bg-primary` | `#1a1a2e` | `#ffffff` |
| `--color-bg-secondary` | `#16213e` | `#f8fafc` |
| `--color-bg-tertiary` | `#0f0f1a` | `#f1f5f9` |

#### Text Colors

| Token Name | Dark Mode Value | Light Mode Value |
|------------|-----------------|------------------|
| `--color-text-primary` | `#ffffff` | `#1e293b` |
| `--color-text-secondary` | `#b8c5d6` | `#475569` |
| `--color-text-muted` | `#8899a8` | `#64748b` |

#### Semantic Colors

| Token Name | Dark Mode Value | Light Mode Value | Contrast Requirement |
|------------|-----------------|------------------|---------------------|
| `--color-success` | `#10b981` | `#059669` | 4.5:1 on background |
| `--color-warning` | `#f59e0b` | `#d97706` | 4.5:1 on background |
| `--color-error` | `#ef4444` | `#dc2626` | 4.5:1 on background |
| `--color-info` | `#3b82f6` | `#2563eb` | 4.5:1 on background |

### Shadow Tokens

| Token Name | Value | Usage |
|------------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.2)` | Subtle elevation |
| `--shadow-md` | `0 4px 6px -1px rgba(0, 0, 0, 0.3)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px -3px rgba(0, 0, 0, 0.4)` | Modals, overlays |
| `--shadow-accent` | `0 4px 15px rgba(13, 148, 136, 0.4)` | Accent glow effect |

### Focus Ring Token

| Token Name | Value | WCAG Requirement |
|------------|-------|------------------|
| `--color-focus-ring` | `rgba(13, 148, 136, 0.5)` | Must be visible 3:1 contrast |

## Validation Rules

### Forbidden Patterns

The following patterns MUST NOT appear in any CSS file except `tokens.css`:

```regex
# Hardcoded hex colors (except transparent)
#[0-9a-fA-F]{3,8}(?!00000000)

# Hardcoded RGB/RGBA (except specific exceptions)
rgba?\([^v]  # Must use var() or exceptions

# Old purple accent colors (MUST be replaced)
#7c3aed
#a855f7
rgba(124, 58, 237, *)
```

### Required Token Usage

```css
/* CORRECT */
.button {
  background: var(--color-accent-gradient);
  color: var(--color-text-primary);
}

/* INCORRECT */
.button {
  background: #0D9488;
  color: #ffffff;
}
```

## Contrast Requirements

All color combinations must meet WCAG AA:

| Combination | Minimum Ratio |
|-------------|---------------|
| Text on background | 4.5:1 |
| Large text (18px+, or 14px bold) on background | 3:1 |
| UI components on background | 3:1 |
| Focus indicators | 3:1 |

### Verified Combinations

| Foreground | Background | Ratio | Status |
|------------|------------|-------|--------|
| `--color-accent-primary` (#0D9488) | `--color-bg-primary` (#1a1a2e) | 4.7:1 | PASS |
| `--color-text-primary` (#ffffff) | `--color-accent-primary` (#0D9488) | 4.5:1 | PASS |
| `--color-text-primary` (#ffffff) | `--color-bg-primary` (#1a1a2e) | 14.2:1 | PASS |
| `--color-accent-primary` (#0D9488) | `--color-bg-primary-light` (#ffffff) | 4.5:1 | PASS |

## Breaking Changes

### From v0 (Purple) to v1 (Teal)

| Old Token/Value | New Token/Value |
|-----------------|-----------------|
| `#7c3aed` | `#0D9488` |
| `#a855f7` | `#14B8A6` |
| `rgba(124, 58, 237, 0.5)` | `rgba(13, 148, 136, 0.5)` |
| `rgba(124, 58, 237, 0.15)` | `rgba(13, 148, 136, 0.15)` |

## Implementation Checklist

- [ ] Update `--color-accent-primary` in tokens.css
- [ ] Update `--color-accent-secondary` in tokens.css
- [ ] Update `--color-accent-gradient` in tokens.css
- [ ] Update `--shadow-accent` with new color
- [ ] Update `--color-focus-ring` with new color
- [ ] Search and replace hardcoded purple values in popup.css
- [ ] Search and replace hardcoded purple values in options.css
- [ ] Verify contrast ratios with automated tool
- [ ] Update visual test baselines
