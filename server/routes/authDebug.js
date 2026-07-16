// File: server/routes/authDebug.js
// Purpose: Minimal "who am I" endpoint to confirm req.user is populated
// Notes: Do NOT leak tokens; safe fields only.

const r = require('express').Router();
// I am loading `../utils/authz` into `hasUser` so this file can reuse that dependency below.
const { hasUser, getUserId, getUserEmail } = require('../utils/authz');

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
r.get('/whoami', (req, res) => {
  // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
  const user = hasUser(req)
    // I am keeping this line here because the surrounding authDebug.js workflow expects this value or operation before it continues.
    ? { id: getUserId(req), email: getUserEmail(req), role: req.user?.role }
    // I am keeping this line here because the surrounding authDebug.js workflow expects this value or operation before it continues.
    : null;

  // This return sends the completed value or response back to the code that called this function.
  return res.status(200).json({
    // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
    ok: true,
    // I am keeping the `hasUser` field in this object so the receiving code can read that value by its expected name.
    hasUser: hasUser(req),
    // I am keeping this line here because the surrounding authDebug.js workflow expects this value or operation before it continues.
    user
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from authDebug.js.
module.exports = r;

