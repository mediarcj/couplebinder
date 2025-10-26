// File: server/ui_contract/navigation/manager.js
// Description: Navigation manager that composes menu items based on auth state
// Purpose: Single point of control for navigation rendering
// Notes: Server-side logic only; no client-side decisions

/**
 * WHAT:
 * Navigation manager that composes the correct menu based on user state and features.
 * 
 * WHY:
 * Centralizes navigation logic to ensure consistency across all pages.
 * Server decides what's visible based on auth state, roles, and feature flags.
 * Prevents duplicate navigation code in templates.
 * 
 * HOW:
 * 1. Load navigation schema with all possible items
 * 2. Filter by auth state and feature flags
 * 3. Determine active state using regex matching
 * 4. Return safe navigation model for templates
 */

const { hasUser } = require('../../utils/authz');

// Safe module loader with fallback
function safeLoad(modPath, fallback = {}) {
  try { return require(modPath); } catch { return fallback; }
}

// Load toggles for feature flags
const toggles = safeLoad('../../config/toggles', { billing: true, signup: true, pricing: false });

/**
 * WHAT:
 * Check if a feature is enabled based on toggles.
 * 
 * WHY:
 * Allow dynamic enabling/disabling of features without code changes.
 * 
 * HOW:
 * Check toggles object for feature flag value.
 */
function featureEnabled(name) {
  if (!name) return true;
  const f = String(name).toLowerCase();
  if (f === 'billing') return !!toggles.billing;
  if (f === 'signup') return !!toggles.signup;
  return true;
}

/**
 * WHAT:
 * Check if user has a specific role.
 * 
 * WHY:
 * Enable role-based navigation items (e.g., admin panel).
 * 
 * HOW:
 * Check req.user.roles array for matching role.
 */
function userHasRole(req, role) {
  if (!req.user) return false;
  if (!role) return true;
  const r = String(role).toLowerCase();
  return Array.isArray(req.user.roles) ? req.user.roles.map(x => String(x).toLowerCase()).includes(r) : false;
}

/**
 * WHAT:
 * Compose navigation menu based on current request state.
 * 
 * WHY:
 * Provide consistent navigation across all pages.
 * Server decides visibility; templates only render.
 * 
 * HOW:
 * 1. Load schema and determine auth state
 * 2. Merge relevant buckets (public/auth/admin)
 * 3. Filter by conditions (auth state, roles, features)
 * 4. Map to safe output format with active state
 * 5. Return nav model with items and CSRF token
 */
function compose(req, res) {
  const schema = require('./navSchema');
  const isAuthed = hasUser(req);

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
      function pickDisplayName(req, res) {
        return (
          res?.locals?.ui?.user?.display_name ||
          res?.locals?.user?.display_name ||
          req.user?.user_metadata?.display_name ||
          req.user?.user_metadata?.display_name_override ||
          req.user?.display_name ||
          req.user?.full_name ||
          req.user?.name ||
          req.user?.email ||
          'User'
        );
      }

      let label = labelSrc;
      if (item.id === 'welcome' && isAuthed) {
        label = labelSrc.replace('{{name}}', pickDisplayName(req, res));
        if (!label) label = `Welcome, ${pickDisplayName(req, res)}!`;
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
        modal: item.modal || null      // pass through for login/signup
      };
    });

  // Dedupe by id (keeps first occurrence)
  const seen = new Set();
  let items = mapped.filter(it => (it && it.id && !seen.has(it.id)) ? (seen.add(it.id), true) : false);

  // Reorder for authenticated pages per spec
  if (isAuthed) {
    const isHome = path === '/' || /^\/\?$/.test(path);
    const isDash = /^\/dashboard(?:$|\/)/.test(path) && !/\/billing|\/profile-edit/.test(path);
    const isBilling = /^\/dashboard\/billing\/?$/.test(path);
    const isProfile = /^\/dashboard\/profile-edit\/?$/.test(path);

    const orderHome = ['dashboard', 'billing', 'profile', 'welcome', 'logout'];
    const orderDashboard = ['home', 'billing', 'profile', 'welcome', 'logout'];
    const orderProfile = ['home', 'billing', 'dashboard', 'welcome', 'logout'];
    const orderBilling = ['home', 'dashboard', 'profile', 'welcome', 'logout'];

    const desired = isHome ? orderHome
                  : isDash ? orderDashboard
                  : isProfile ? orderProfile
                  : isBilling ? orderBilling
                  : orderHome;

    const byId = {};
    items.forEach(it => { byId[it.id] = it; });
    items = desired.map(id => byId[id]).filter(Boolean);
  }

  // Provide CSRF token for POST forms (from middleware)
  const csrfToken = res?.locals?.csrfToken || '';

  return {
    items,
    csrfToken
  };
}

module.exports = { compose };
