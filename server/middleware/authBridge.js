// File: server/middleware/authBridge.js
// Description: Reads Supabase access token, verifies it, attaches req.user. No sessions, no Redis.
// Notes: Stateless authentication using Supabase tokens

const { supabase } = require('../utils/supabaseClient');

module.exports = async function authBridge(req, res, next) {
  /**
   * WHAT: Try to get a Supabase access token from either:
   *  - Authorization: Bearer <token>, or
   *  - Cookie: sb_access_token=<token> (HttpOnly cookie we may set later)
   * WHY: We want identity without keeping server-side session state.
   */
  try {
    const authz = req.headers.authorization || '';
    const headerToken = authz.startsWith('Bearer ') ? authz.slice(7) : null;

    const cookie = req.headers.cookie || '';
    const cookieTokenMatch = cookie.match(/(?:^|;\s*)sb_access_token=([^;]+)/);
    const cookieToken = cookieTokenMatch ? decodeURIComponent(cookieTokenMatch[1]) : null;

    const token = headerToken || cookieToken;
    if (!token) {
      req.user = null;
      return next();
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      req.user = null;
      return next();
    }

    req.user = { id: data.user.id, email: data.user.email || null };
    return next();
  } catch {
    req.user = null;
    return next();
  }
};
