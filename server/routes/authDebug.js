// Purpose: Minimal "who am I" endpoint to confirm req.user is populated
// Notes: Do NOT leak tokens; safe fields only.

const r = require('express').Router();
const { hasUser, getUserId, getUserEmail } = require('../utils/authz');

r.get('/whoami', (req, res) => {
  const user = hasUser(req)
    ? { id: getUserId(req), email: getUserEmail(req), role: req.user?.role }
    : null;

  return res.status(200).json({
    ok: true,
    hasUser: hasUser(req),
    user
  });
});

module.exports = r;

