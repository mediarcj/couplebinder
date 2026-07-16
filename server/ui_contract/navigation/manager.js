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
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try { return require(modPath); } catch { return fallback; }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Load toggles for feature flags
const toggles = safeLoad('../../config/toggles', { billing: true, register: true, pricing: false });

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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!name) return true;
  // I am saving `f` here so the nearby steps can reuse the same value without rebuilding it each time.
  const f = String(name).toLowerCase();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (f === 'billing') return !!toggles.billing;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (f === 'register') return !!toggles.register;
  // This return sends the completed value or response back to the code that called this function.
  return true;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!req.user) return false;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!role) return true;
  // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
  const r = String(role).toLowerCase();
  // This return sends the completed value or response back to the code that called this function.
  return Array.isArray(req.user.roles) ? req.user.roles.map(x => String(x).toLowerCase()).includes(r) : false;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am loading `./navSchema` into `schema` so this file can reuse that dependency below.
  const schema = require('./navSchema');
  // I am saving `isAuthed` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isAuthed = hasUser(req);

  // Merge all relevant nav items based on auth state
  const buckets = [];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (isAuthed) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    buckets.push(...schema.auth);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    buckets.push(...schema.admin);
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    buckets.push(...schema.public);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Extract pathname only (ignore query string for route matching)
  const rawPath = req.originalUrl || req.url || '/';
  // I am saving `urlMatch` here so the nearby steps can reuse the same value without rebuilding it each time.
  const urlMatch = rawPath.match(/^([^?#]+)/);
  // I am saving `path` here so the nearby steps can reuse the same value without rebuilding it each time.
  const path = urlMatch ? urlMatch[1] : rawPath;

  // Filter by conditions
  let filtered = buckets
    // I am filtering the collection here so only items that pass the nearby check continue to the next step.
    .filter(item => {
      // Check auth state
      if (item.when === 'auth' && !isAuthed) return false;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (item.when === 'unauth' && isAuthed) return false;
      
      // Check role requirements
      if (item.when && item.when.startsWith('role:')) {
        // I am saving `role` here so the nearby steps can reuse the same value without rebuilding it each time.
        const role = item.when.split(':', 2)[1] || '';
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!userHasRole(req, role)) return false;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      
      // Check feature flags
      if (item.feature && !featureEnabled(item.feature)) return false;
      
      // This return sends the completed value or response back to the code that called this function.
      return true;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

  // Map, determine active
  let mapped = filtered.map(item => {
      // Sanitize href and action (remove whitespace)
      const safeHref = item.href && String(item.href).replace(/\s/g, '');
      // I am saving `safeAction` here so the nearby steps can reuse the same value without rebuilding it each time.
      const safeAction = item.action && String(item.action).replace(/\s/g, '');
      // I am saving `method` here so the nearby steps can reuse the same value without rebuilding it each time.
      const method = (item.method || 'GET').toUpperCase();
      // I am saving `kind` here so the nearby steps can reuse the same value without rebuilding it each time.
      const kind = item.type === 'text' ? 'text' : (method === 'POST' ? 'action' : 'link');

      // Determine active state using regex match
      let active = false;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (item.activeMatch) {
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
          active = new RegExp(item.activeMatch).test(path);
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch {
          // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
          active = false;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // I am checking this next possibility only because the earlier condition did not choose its path.
      } else if (safeHref) {
        // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
        active = path === safeHref || path.startsWith(safeHref + '/');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // Choose label / template source robustly
      const labelSrc = (typeof item.label !== 'undefined' && item.label !== null)
        // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
        ? String(item.label)
        // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
        : (typeof item.template !== 'undefined' && item.template !== null ? String(item.template) : '');

      // Robust display name resolver (prefer canonical display_name)
      function pickDisplayName(req, res) {
        // This return sends the completed value or response back to the code that called this function.
        return (
          // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
          res?.locals?.ui?.user?.display_name ||
          // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
          res?.locals?.user?.display_name ||
          // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
          req.user?.user_metadata?.display_name ||
          // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
          req.user?.user_metadata?.display_name_override ||
          // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
          req.user?.display_name ||
          // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
          req.user?.full_name ||
          // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
          req.user?.name ||
          // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
          req.user?.given_name ||
          // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
          req.user?.email ||
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'User'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        );
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // I am saving `label` here so the nearby steps can reuse the same value without rebuilding it each time.
      let label = labelSrc;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (item.id === 'welcome' && isAuthed) {
        // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
        label = labelSrc.replace('{{given_name}}', pickDisplayName(req, res));
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (!label) label = `Welcome, ${pickDisplayName(req, res)}!`;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // This return sends the completed value or response back to the code that called this function.
      return {
        // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
        id: item.id,
        // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
        label,
        type: kind,                    // 'link' | 'action' | 'text'
        // I am keeping the `href` field in this object so the receiving code can read that value by its expected name.
        href: method === 'POST' ? null : safeHref,
        // I am keeping the `action` field in this object so the receiving code can read that value by its expected name.
        action: method === 'POST' ? safeAction : null,
        // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
        method,
        // I am keeping the `csrf` field in this object so the receiving code can read that value by its expected name.
        csrf: !!item.csrf,
        // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
        active,
        modal: item.modal || null      // pass through for login/register
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

  // Dedupe by id (keeps first occurrence)
  const seen = new Set();
  // I am saving `items` here so the nearby steps can reuse the same value without rebuilding it each time.
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
        // I am keeping the `home` field in this object so the receiving code can read that value by its expected name.
        home: [
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'dashboard',
          'billing', // NEW_BUTTON_MARKER
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'profile',
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'welcome',
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'logout'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        ],
        // I am keeping the `dashboard` field in this object so the receiving code can read that value by its expected name.
        dashboard: [
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'home',
          'billing', // NEW_BUTTON_MARKER
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'profile',
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'welcome',
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'logout'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        ],
        // I am keeping the `billing` field in this object so the receiving code can read that value by its expected name.
        billing: [
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'home',
          'dashboard', // NEW_BUTTON_MARKER
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'profile',
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'welcome',
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'logout'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        ],
        // I am keeping the `profile` field in this object so the receiving code can read that value by its expected name.
        profile: [
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'home',
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'dashboard',
          'billing', // NEW_BUTTON_MARKER
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'welcome',
          // I am listing this entry here because the surrounding collection processes each allowed value in order.
          'logout'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        ]
    }; // NEW_ARRAY_MARKER
    // === END_NAVSETS_BLOCK ===

    // Figure out which key to use (direct mapping)
    let current = 'home';
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (path.startsWith('/dashboard/profile-edit')) current = 'profile';
    // I am checking this next possibility only because the earlier condition did not choose its path.
    else if (path.startsWith('/dashboard/billing')) current = 'billing';
    // I am checking this next possibility only because the earlier condition did not choose its path.
    else if (path.startsWith('/dashboard')) current = 'dashboard';
    // I am checking this next possibility only because the earlier condition did not choose its path.
    else if (path === '/' || path === '/?') current = 'home';

    // Select nav set explicitly
    const desired = navSets[current] || navSets.home;

    // Build lookup table for final ordered nav items
    const byId = {};
    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    items.forEach(it => { byId[it.id] = it; });

    // Finalize order (hide any undefined)
    items = desired.map(id => byId[id]).filter(Boolean);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Provide CSRF token for POST forms (from middleware)
  const csrfToken = res?.locals?.csrfToken || '';

  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
    items,
    // I am keeping this line here because the surrounding manager.js workflow expects this value or operation before it continues.
    csrfToken
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from manager.js.
module.exports = { compose };
