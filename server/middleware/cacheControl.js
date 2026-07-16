/**
 * Description: Set no-store cache on dynamic/app routes. Leaves static assets alone.
 *
 * Applies Cache-Control: no-store to dynamic routes to prevent caching of sensitive data.
 *
 * Dynamic pages (dashboard, profile, etc.) contain user-specific data that must not be
 * cached by browsers or proxies. Static assets (JS, CSS, images) can be cached safely.
 *
 * Checks request path against static prefixes. If not static, sets no-store header.
 * This ensures browsers always fetch fresh data for authenticated/dynamic pages.
 */

const STATIC_PREFIXES = ['/js/', '/css/', '/images/', '/favicon', '/assets/'];

module.exports = function cacheControl() {
  return function (req, res, next) {
    const p = req.path || '';
    const isStatic = STATIC_PREFIXES.some(prefix => p.startsWith(prefix));
    
    if (!isStatic) {
      // Dynamic route: prevent all caching
      res.set('Cache-Control', 'no-store');
    }
    // Static assets: let default caching behavior apply
    
    next();
  };
};

