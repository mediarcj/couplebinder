// File: server/routes/authDebug.js
// Purpose: Minimal "who am I" endpoint to confirm req.user is populated
// Notes: Do NOT leak tokens; safe fields only.

const r = require('express').Router();

r.get('/whoami', (req, res) => {
  const user = req.user
    ? { id: req.user.id, email: req.user.email, role: req.user.role }
    : null;

  return res.status(200).json({
    ok: true,
    hasUser: Boolean(req.user),
    user
  });
});

module.exports = r;

