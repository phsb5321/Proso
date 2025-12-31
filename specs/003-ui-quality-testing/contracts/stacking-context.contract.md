# Stacking Context Contract

**Version**: 1.0.0
**Feature**: 003-ui-quality-testing

## Overview

This contract defines the z-index layering system for VoxPage UI elements. All positioned elements must use z-index values within their designated layer range.

## Layer Definitions

### Layer 0: Base (z-index: auto)

**Purpose**: Normal document flow elements

**Elements**:
- Static content
- Non-positioned elements
- Default flex/grid children

**Rules**:
- No explicit z-index required
- Stacking follows DOM order

---

### Layer 1: Elevated (z-index: 1-10)

**Purpose**: Elements that need to appear above siblings

**Elements**:
- Hover states
- Focus rings
- Selected items
- Active buttons

**Implementation**:
```css
.element:hover {
  position: relative;
  z-index: 1;
}
```

**Rules**:
- Use `position: relative` minimum
- Prefer z-index: 1 unless overlap requires higher

---

### Layer 2: Floating (z-index: 50-99)

**Purpose**: Temporarily visible UI that floats above content

**Elements**:
- Dropdown menus
- Tooltips
- Popovers
- Visualizer section (when playing)

**Implementation**:
```css
.dropdown {
  position: absolute;
  z-index: 50;
}

.tooltip {
  position: absolute;
  z-index: 60;
}
```

**Rules**:
- Must use `position: absolute` or `position: fixed`
- Tooltips (60) appear above dropdowns (50)

---

### Layer 3: Overlay (z-index: 100+)

**Purpose**: Full-screen overlays that block all other content

**Elements**:
- Onboarding overlay
- Modal dialogs
- Status banners (when critical)

**Implementation**:
```css
.onboarding-overlay {
  position: fixed;
  z-index: 100;
  isolation: isolate; /* Creates new stacking context */
}

.onboarding-tooltip {
  position: absolute;
  z-index: 101; /* Above overlay background */
}
```

**Rules**:
- MUST use `isolation: isolate` on overlay container
- Child elements use z-index relative to isolated context
- Maximum z-index: 999 (reserve higher for browser UI)

---

## Stacking Context Rules

### Rule 1: Use `isolation: isolate` for Complex Overlays

```css
/* CORRECT: Creates predictable stacking */
.overlay-container {
  isolation: isolate;
}

/* INCORRECT: Relies on high z-index values */
.overlay-container {
  z-index: 99999; /* Z-index arms race */
}
```

### Rule 2: Avoid Transform/Opacity Stacking Context Traps

These CSS properties create new stacking contexts, which can cause z-index issues:
- `transform`
- `opacity` < 1
- `filter`
- `backdrop-filter`

**Mitigation**:
```css
/* If using transform, ensure z-index is set */
.animated-element {
  transform: translateY(-10px);
  position: relative;
  z-index: 1; /* Prevent stacking context isolation */
}
```

### Rule 3: DOM Order for Same-Layer Elements

When elements share the same z-index layer, later DOM elements appear above earlier ones.

```html
<!-- CORRECT: Toast appears above banner (DOM order) -->
<div class="status-banner" style="z-index: 100"></div>
<div class="toast" style="z-index: 100"></div>

<!-- INCORRECT: Relies on z-index difference -->
<div class="toast" style="z-index: 101"></div>
<div class="status-banner" style="z-index: 100"></div>
```

## Z-Index Registry

| Element | Z-Index | Layer | Notes |
|---------|---------|-------|-------|
| Body content | auto | Base | Default |
| Hover states | 1 | Elevated | Temporary |
| Focus rings | 2 | Elevated | Accessibility |
| Dropdowns | 50 | Floating | - |
| Tooltips | 60 | Floating | Above dropdowns |
| Visualizer glow | 70 | Floating | When playing |
| Status banner | 100 | Overlay | - |
| Onboarding overlay | 100 | Overlay | Uses isolation |
| Onboarding tooltip | 101 | Overlay | Child of overlay |

## Forbidden Patterns

```css
/* FORBIDDEN: Arbitrary high z-index */
.element {
  z-index: 9999;
  z-index: 999999;
}

/* FORBIDDEN: Negative z-index (except for backgrounds) */
.element {
  z-index: -1; /* Only allowed for decorative backgrounds */
}

/* FORBIDDEN: Z-index without position */
.element {
  z-index: 10;
  /* Missing: position: relative/absolute/fixed */
}
```

## Testing Requirements

### Visual Regression Tests

1. **Overlay Stacking Test**: Verify onboarding overlay covers all content
2. **Tooltip Stacking Test**: Verify tooltips appear above their trigger elements
3. **Focus State Test**: Verify focus rings are visible above adjacent elements
4. **Hover State Test**: Verify hover effects don't cause z-index issues

### Manual QA Checklist

- [ ] Open popup with onboarding overlay
- [ ] Verify no buttons/icons poke through overlay
- [ ] Dismiss overlay and verify all elements return to normal
- [ ] Test hover states on all interactive elements
- [ ] Verify visualizer doesn't overlap player controls
- [ ] Test dropdown menus appear above content
