// Description: Navigation manager that composes menu items based on auth state
// Purpose: Single point of control for navigation rendering
// Notes: Server-side logic only; no client-side decisions

/**
 * Navigation manager that composes the correct menu based on user state and features.
 * 
 * Centralizes navigation logic to ensure consistency across all pages.
 * Server decides what's visible based on auth state, roles, and feature flags.
 * Prevents duplicate navigation code in templates.
 * 
 * 1. Load navigation schema with all possible items
 * 2. Filter by auth state and feature flags
 * 3. Determine active state using regex matching
 * 4. Return safe navigation model for templates
 */

const { assertUser, hasUser } = require('../../utils/authz');
const {
  requestHasRole
} = require('../../security/roleAuthority');

// Safe module loader with fallback
function safeLoad(modPath, fallback = {}) {
  try { return require(modPath); } catch { return fallback; }
}

// Load toggles for feature flags
const toggles = safeLoad('../../config/toggles', { billing: true, register: true, pricing: false });

/**
 * Check if a feature is enabled based on toggles.
 * 
 * Allow dynamic enabling/disabling of features without code changes.
 * 
 * Check toggles object for feature flag value.
 */
function featureEnabled(name) {
  if (!name) return true;
  const f = String(name).toLowerCase();
  if (f === 'billing') return !!toggles.billing;
  if (f === 'register') return !!toggles.register;
  return true;
}

/**
 * Check if user has a specific role.
 * 
 * Enable role-based navigation items (e.g., admin panel).
 * 
 * Check the request-local signed-role authority for a matching role.
 */
function userHasRole(req, role) {
  if (!hasUser(req)) return false;
  if (!role) return true;
  return requestHasRole(req, role);
}

/**
 * Compose navigation menu based on current request state.
 * 
 * Provide consistent navigation across all pages.
 * Server decides visibility; templates only render.
 * 
 * 1. Load schema and determine auth state
 * 2. Merge relevant buckets (public/auth/admin)
 * 3. Filter by conditions (auth state, roles, features)
 * 4. Map to safe output format with active state
 * 5. Return nav model with items and CSRF token
 */
function compose(req, res) {
  const schema = require('./navSchema');
  const isAuthed = hasUser(req);
  const authenticatedUser = isAuthed ? assertUser(req) : null;

  // Merge all relevant nav items based on auth state
  const buckets = [];
  if (isAuthed) {
    buckets.push(...schema.auth);
    buckets.push(...schema.admin);
  } else {
    buckets.push(...schema.public);
  }

  // Extract pathname only (ignore query string for route matching)
  const rawPath = req.originalUrl || req.url || '/';
  const urlMatch = rawPath.match(/^([^?#]+)/);
  const path = urlMatch ? urlMatch[1] : rawPath;

  // Filter by conditions
  let filtered = buckets
    .filter(item => {
      // Check auth state
      if (item.when === 'auth' && !isAuthed) return false;
      if (item.when === 'unauth' && isAuthed) return false;
      
      // Check role requirements
      if (item.when && item.when.startsWith('role:')) {
        const role = item.when.split(':', 2)[1] || '';
        if (!userHasRole(req, role)) return false;
      }
      
      // Check feature flags
      if (item.feature && !featureEnabled(item.feature)) return false;
      
      return true;
    });

  // Map, determine active
  let mapped = filtered.map(item => {
      // Sanitize href and action (remove whitespace)
      const safeHref = item.href && String(item.href).replace(/\s/g, '');
      const safeAction = item.action && String(item.action).replace(/\s/g, '');
      const method = (item.method || 'GET').toUpperCase();
      const kind = item.type === 'text' ? 'text' : (method === 'POST' ? 'action' : 'link');

      // Determine active state using regex match
      let active = false;
      if (item.activeMatch) {
        try {
          active = new RegExp(item.activeMatch).test(path);
        } catch {
          active = false;
        }
      } else if (safeHref) {
        active = path === safeHref || path.startsWith(safeHref + '/');
      }

      // Choose label / template source robustly
      const labelSrc = (typeof item.label !== 'undefined' && item.label !== null)
        ? String(item.label)
        : (typeof item.template !== 'undefined' && item.template !== null ? String(item.template) : '');

      // Robust display name resolver (prefer canonical display_name)
      function pickDisplayName(res) {
        return (
          res?.locals?.ui?.user?.display_name ||
          res?.locals?.user?.display_name ||
          authenticatedUser?.user_metadata?.display_name ||
          authenticatedUser?.user_metadata?.display_name_override ||
          authenticatedUser?.display_name ||
          authenticatedUser?.full_name ||
          authenticatedUser?.name ||
          authenticatedUser?.given_name ||
          authenticatedUser?.email ||
          'User'
        );
      }

      let label = labelSrc;
      if (item.id === 'welcome' && isAuthed) {
        label = labelSrc.replace('{{given_name}}', pickDisplayName(res));
        if (!label) label = `Welcome, ${pickDisplayName(res)}!`;
      }

      return {
        id: item.id,
        label,
        type: kind,                    // 'link' | 'action' | 'text'
        href: method === 'POST' ? null : safeHref,
        action: method === 'POST' ? safeAction : null,
        method,
        csrf: !!item.csrf,
        active,
        modal: item.modal || null      // pass through for login/register
      };
    });

  // Dedupe by id (keeps first occurrence)
  const seen = new Set();
  let items = mapped.filter(it => (it && it.id && !seen.has(it.id)) ? (seen.add(it.id), true) : false);

  // ---------- SIMPLE NAV CONFIGURATION SYSTEM ----------
  // One explicit configuration per page. No regex tricks, no auto-filtering.
  // You just define the buttons you want visible for each page here.

  if (isAuthed) {
    // Determine which page we're on by simple path includes
    const path = req.originalUrl || req.url || '/';

    // Explicit button sets per page
    // === START_NAVSETS_BLOCK ===
    const navSets = {
        home: [
          'dashboard',
          'billing', // NEW_BUTTON_MARKER
          'profile',
          'welcome',
          'logout'
        ],
        dashboard: [
          'home',
          'billing', // NEW_BUTTON_MARKER
          'profile',
          'welcome',
          'logout'
        ],
        billing: [
          'home',
          'dashboard', // NEW_BUTTON_MARKER
          'profile',
          'welcome',
          'logout'
        ],
        profile: [
          'home',
          'dashboard',
          'billing', // NEW_BUTTON_MARKER
          'welcome',
          'logout'
        ]
    }; // NEW_ARRAY_MARKER
    // === END_NAVSETS_BLOCK ===

    // Figure out which key to use (direct mapping)
    let current = 'home';
    if (path.startsWith('/dashboard/profile-edit')) current = 'profile';
    else if (path.startsWith('/dashboard/billing')) current = 'billing';
    else if (path.startsWith('/dashboard')) current = 'dashboard';
    else if (path === '/' || path === '/?') current = 'home';

    // Select nav set explicitly
    const desired = navSets[current] || navSets.home;

    // Build lookup table for final ordered nav items
    const byId = {};
    items.forEach(it => { byId[it.id] = it; });

    // Finalize order (hide any undefined)
    items = desired.map(id => byId[id]).filter(Boolean);
  }
  
  // Provide CSRF token for POST forms (from middleware)
  const csrfToken = res?.locals?.csrfToken || '';

  return {
    items,
    csrfToken
  };
}

module.exports = {
  compose,
  userHasRole
};
