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
    // I am keeping this line here because the surrounding navSchema.js workflow expects this value or operation before it continues.
    { id: 'home',     label: 'Home',     href: '/',                    when: 'unauth', activeMatch: '^/$' },
    // I am keeping this line here because the surrounding navSchema.js workflow expects this value or operation before it continues.
    { id: 'login',    label: 'Log in',   href: '/login',                when: 'unauth', activeMatch: '^/login/?$' },
    // I am keeping this line here because the surrounding navSchema.js workflow expects this value or operation before it continues.
    { id: 'register', label: 'Register', href: '/register',            when: 'unauth', activeMatch: '^/register/?$' }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ],

  // Visible to authenticated users
  auth: [
    // Primary sections (manager will exclude the active one and order per page)
    { id: 'home',      label: 'Home',      href: '/',                          when: 'auth',    activeMatch: '^/$' },
    // I am keeping this line here because the surrounding navSchema.js workflow expects this value or operation before it continues.
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard',                 when: 'auth',    activeMatch: '^/dashboard(?:$|/)' },
    // I am keeping this line here because the surrounding navSchema.js workflow expects this value or operation before it continues.
    { id: 'billing',   label: 'Billing',   href: '/dashboard/billing',         when: 'auth',    feature: 'billing', activeMatch: '^/dashboard/billing/?$' },
    // I am keeping this line here because the surrounding navSchema.js workflow expects this value or operation before it continues.
    { id: 'profile',   label: 'Profile',   href: '/dashboard/profile-edit',    when: 'auth',    activeMatch: '^/dashboard/profile-edit/?$' },
    // Non-nav text item (manager fills display name)
    { id: 'welcome',   type: 'text',       template: 'Welcome, {{given_name}}!',     when: 'auth' },
    // POST action with CSRF; rendered as a form, not a link
    { id: 'logout',    label: 'Log out',   action: '/auth/clear-cookie',       method: 'POST', csrf: true, data: { logout: 'true' }, when: 'auth' }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ],

  // Optional admin items
  admin: [
    // I am keeping this line here because the surrounding navSchema.js workflow expects this value or operation before it continues.
    { id: 'admin',     label: 'Admin',     href: '/dashboard/admin',         when: 'role:admin', activeMatch: '^/dashboard/admin/?$' }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ]
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
