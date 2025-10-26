// File: server/ui_contract/navigation/navSchema.js
// Description: Single source of truth for all navigation items
// Purpose: Centralize navigation configuration to eliminate duplication
// Notes: Server decides what shows; browser only renders (no trust in client)

/**
 * WHAT:
 * Central navigation schema that defines all possible nav items for the application.
 * 
 * WHY:
 * Eliminates hard-coded navigation in every template.
 * Single source of truth ensures consistency and makes updates easy.
 * Server decides visibility based on auth state and roles.
 * 
 * HOW:
 * Define nav items by visibility (public, auth, admin) with conditions.
 * Template only renders what server provides (no client-side logic).
 */

module.exports = {
  // Visible to everyone (not signed in)
  public: [
    { id: 'home',     label: 'Home',     href: '/',                    when: 'unauth', activeMatch: '^/$' },
    { id: 'pricing',  label: 'Pricing',  href: '/pricing',             when: 'unauth', feature: 'pricing', activeMatch: '^/pricing/?$' },
    { id: 'login',    label: 'Log in',   href: '/?login=true',         when: 'unauth', modal: 'login', activeMatch: '\\blogin=true\\b' },
    { id: 'signup',   label: 'Sign up',  href: '/?signup=true',        when: 'unauth', modal: 'signup', feature: 'signup', activeMatch: '\\bsignup=true\\b' }
  ],

  // Visible to authenticated users
  auth: [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard',               when: 'auth',    activeMatch: '^/dashboard(?:$|/)' },
    { id: 'billing',   label: 'Billing',   href: '/dashboard/billing',       when: 'auth',    feature: 'billing', activeMatch: '^/dashboard/billing/?$' },
    { id: 'profile',   label: 'Profile',   href: '/dashboard/profile-edit',  when: 'auth',    activeMatch: '^/dashboard/profile-edit/?$' },
    // POST action with CSRF; rendered as a form, not a link
    { id: 'logout',    label: 'Log out',   action: '/auth/clear-cookie',     method: 'POST', csrf: true, data: { logout: 'true' }, when: 'auth' }
  ],

  // Optional admin items
  admin: [
    { id: 'admin',     label: 'Admin',     href: '/dashboard/admin',         when: 'role:admin', activeMatch: '^/dashboard/admin/?$' }
  ]
};
