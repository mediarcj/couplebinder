// File: server/middleware/supabaseAuth.js
// Description: Middleware to validate Supabase Auth JWT and attach user to request
// Purpose: Trust Supabase as identity provider while keeping server-session and CSRF
// Notes: Reads token from Authorization: Bearer or Supabase cookies; never logs secrets

const { supabase } = require('../utils/supabaseClient');

/**
 * WHAT:
 * Validate Supabase JWT on incoming requests and attach the user to req.
 *
 * WHY:
 * We are switching identity to Supabase Auth. The server remains the source of truth
 * and uses the verified Supabase user to drive permissions and UI instructions.
 *
 * HOW:
 * Extract a bearer token or Supabase cookie token, call Supabase to getUser,
 * and populate req.supabaseUser and minimal session flags without exposing secrets.
 */
function extractToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  // Supabase JS client sets these cookie names by default in client apps.
  // We read them if present, but do not rely on them exclusively.
  const accessCookie = req.cookies?.['sb-access-token'] || req.cookies?.['sb:token'];
  if (accessCookie && typeof accessCookie === 'string') {
    return accessCookie;
  }
  return null;
}

function supabaseAuth() {
  return async function supabaseAuthMiddleware(req, res, next) {
    try {
      const token = extractToken(req);
      if (!token) {
        return next();
      }

      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        return next();
      }

      // Attach user to request (server remains commander of truth)
      req.supabaseUser = data.user;

      // Maintain compatibility with existing session-based guards
      if (req.session) {
        req.session.isAuthenticated = true;
        req.session.userId = data.user.id;
        req.session.supabaseUser = { id: data.user.id, email: data.user.email };
      }

      return next();
    } catch (err) {
      // Do not leak details; continue without user on failures
      return next();
    }
  };
}

function requireSupabaseAuth() {
  return function requireSupabaseAuthMiddleware(req, res, next) {
    const isAuthed = Boolean(req.supabaseUser?.id || (req.session && req.session.isAuthenticated));
    if (isAuthed) return next();
    return res.redirect('/?login=true');
  };
}

module.exports = {
  supabaseAuth,
  requireSupabaseAuth
};


