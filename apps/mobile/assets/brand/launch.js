/**
 * Launch-screen constants shared by the native splash (read by
 * `app.config.js` at prebuild time) and the JS handoff overlay
 * (`src/components/LaunchScreen.tsx`, read at runtime).
 *
 * The two MUST agree pixel-for-pixel: the OS paints the native storyboard
 * / Android 12 splash first, then the JS overlay draws the same PNG at the
 * same width in the same place, and only then is the native splash
 * hidden — the user never sees the seam. If you change either value, both
 * sides pick it up from here; there is deliberately no second copy.
 *
 * Plain CommonJS so `app.config.js` (Node, no transpile) can `require` it.
 */
module.exports = {
  /** Path of the rasterized mark, relative to apps/mobile. */
  SPLASH_IMAGE: './assets/splash-icon.png',
  /** Rendered width (pt / dp) of the mark on the launch screen. */
  SPLASH_IMAGE_WIDTH: 120,
  /** Warm off-white canvas — `Colors.background` in src/theme/colors.ts. */
  SPLASH_BACKGROUND: '#FBFAF7',
}
