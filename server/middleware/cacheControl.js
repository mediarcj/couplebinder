/**
 * File: server/middleware/cacheControl.js
 * Description: Set no-store cache on dynamic/app routes. Leaves static assets alone.
 *
 * WHAT:
 * Applies Cache-Control: no-store to dynamic routes to prevent caching of sensitive data.
 *
 * WHY:
 * Dynamic pages (dashboard, profile, etc.) contain user-specific data that must not be
 * cached by browsers or proxies. Static assets (JS, CSS, images) can be cached safely.
 *
 * HOW:
 * Checks request path against static prefixes. If not static, sets no-store header.
 * This ensures browsers always fetch fresh data for authenticated/dynamic pages.
 */

const STATIC_PREFIXES = ['/js/', '/css/', '/images/', '/favicon', '/assets/'];

// I am exporting this value here so another module can deliberately reuse the completed piece from cacheControl.js.
module.exports = function cacheControl() {
  // This return sends the completed value or response back to the code that called this function.
  return function (req, res, next) {
    // I am saving `p` here so the nearby steps can reuse the same value without rebuilding it each time.
    const p = req.path || '';
    // I am saving `isStatic` here so the nearby steps can reuse the same value without rebuilding it each time.
    const isStatic = STATIC_PREFIXES.some(prefix => p.startsWith(prefix));
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!isStatic) {
      // Dynamic route: prevent all caching
      res.set('Cache-Control', 'no-store');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // Static assets: let default caching behavior apply
    
    next();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

