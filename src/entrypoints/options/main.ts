/**
 * VoxPage Options Page Entry Point
 * WXT TypeScript migration - Phase 4
 */

import { initOptionsPage } from './controller';
import { getThemeManager } from '../../utils/options/theme-manager';

// T056: Initialize ThemeManager early to prevent flash of wrong theme
const themeManager = getThemeManager();

// Initialize theme before DOM is fully ready to prevent FOUC
themeManager.init().catch(console.error);

// Initialize the options page when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initOptionsPage();
});
