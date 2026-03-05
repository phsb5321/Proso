// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Proso Contributors. All rights reserved.
// Commercial licensing: https://proso.com.br/commercial

/**
 * Proso Options Page Entry Point
 * WXT TypeScript migration - Phase 4
 */

import 'virtual:uno.css';
import { getThemeManager } from '../../utils/options/theme-manager';
import { initOptionsPage } from './controller';

// T056: Initialize ThemeManager early to prevent flash of wrong theme
const themeManager = getThemeManager();

// Initialize theme before DOM is fully ready to prevent FOUC
themeManager.init().catch(console.error);

// Initialize the options page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initOptionsPage();
});
