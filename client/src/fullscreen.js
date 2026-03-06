/**
 * fullscreen.js — PWA Fullscreen Utility
 * Handles three layers of "no address bar" for Android Chrome:
 *   1. Fullscreen API  — triggered on first user interaction
 *   2. Screen Orientation API — locks to landscape
 *   3. Scroll trick — fallback for browsers that block Fullscreen API
 *
 * Call window.__requestFullscreen() from your Phaser splash screen button
 * for best compatibility.
 */

const doc = document.documentElement;

// ── Scroll-trick fallback (legacy browsers / Android WebView) ──────────────
window.addEventListener('load', () => {
  setTimeout(() => window.scrollTo(0, 1), 100);
});

// ── Core fullscreen + orientation lock ────────────────────────────────────
async function enterFullscreen() {
  try {
    if (doc.requestFullscreen) {
      await doc.requestFullscreen({ navigationUI: 'hide' });
    } else if (doc.webkitRequestFullscreen) {   // Safari / iOS webkit
      await doc.webkitRequestFullscreen();
    }
    // Lock to landscape after fullscreen is granted
    if (screen.orientation?.lock) {
      try { await screen.orientation.lock('landscape'); }
      catch (e) { console.warn('[fullscreen] Orientation lock:', e.message); }
    }
  } catch (err) {
    console.warn('[fullscreen] Request failed:', err.message);
  }
}

// Expose for manual call from Phaser scenes:
//   this.input.once('pointerdown', () => window.__requestFullscreen());
window.__requestFullscreen = enterFullscreen;

// ── Auto-trigger on first user interaction ─────────────────────────────────
function onFirstInteraction() { enterFullscreen(); }
window.addEventListener('pointerdown', onFirstInteraction, { once: true });
window.addEventListener('keydown',     onFirstInteraction, { once: true });

// ── Re-enter if user accidentally exits fullscreen (e.g. swipe-up) ─────────
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    window.addEventListener('pointerdown', onFirstInteraction, { once: true });
  }
});