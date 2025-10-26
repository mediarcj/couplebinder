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

  const path = req.originalUrl || req.url || '/';

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
      // Sanitize href and action (remove whitespace, no query strings)
      const safeHref = item.href && String(item.href).replace(/\s/g, '');
      const safeAction = item.action && String(item.action).replace(/\s/g, '');
      const method = (item.method || 'GET').toUpperCase();

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

      return {
        id: item.id,
        label: item.label,
        template: item.template,      // for 'welcome' text
        modal: item.modal,            // for auth modals (login/signup)
        type: method === 'POST' ? 'action' : (item.type || 'link'),
        href: method === 'POST' ? null : safeHref,
        action: method === 'POST' ? safeAction : null,
        method,
        csrf: !!item.csrf,
        active
      };
    });

  // Build per-page ordering for authed state
  if (isAuthed) {
    const primaryOrder = ['home', 'dashboard', 'billing', 'profile'];
    const byId = new Map(mapped.map(x => [x.id, x]));
    // Figure out which primary is active
    const activePrimary = primaryOrder.map(id => byId.get(id)).filter(Boolean).find(x => x.active);
    const activeId = activePrimary ? activePrimary.id : null;
    // Visible primaries (exclude the active one)
    const primaries = primaryOrder
      .map(id => byId.get(id))
      .filter(Boolean)
      .filter(x => x.id !== activeId);
    // Welcome text -> resolve label
    let welcome = byId.get('welcome');
    if (welcome) {
      const user = res?.locals?.user || req?.user || {};
      const name = user.full_name || user.name || user.display_name || user.email || 'Friend';
      welcome = { ...welcome, type: 'text', label: (welcome.template || 'Welcome, {{name}}!').replace('{{name}}', String(name)) };
    }
    // Logout action
    const logout = byId.get('logout');
    // Optional admin item(s) before logout
    const admin = mapped.filter(x => x.id === 'admin');
    // Compose final
    mapped = []
      .concat(primaries)
      .concat(welcome ? [welcome] : [])
      .concat(admin)
      .concat(logout ? [logout] : []);
  }

  // Deduplicate by id (in case templates still include legacy nav)
  const seen = new Set();
  const items = mapped.filter(x => (x && !seen.has(x.id) && seen.add(x.id)));

  // Provide CSRF token for POST forms (from middleware)
  const csrfToken = res?.locals?.csrfToken || '';

  return {
    items,
    csrfToken
  };
}

module.exports = { compose };
