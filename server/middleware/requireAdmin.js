// Description: Default-deny administrator authorization middleware
// Purpose: Gate server-mediated administrator routes with the central signed-role result
// Security: Database, profile, query, body, and user-metadata values cannot grant access

'use strict';

const { assertUser } = require('../utils/authz');
const {
  isRequestAdmin
} = require('../security/roleAuthority');

function requireAdmin(req, res, next) {
  try {
    assertUser(req);
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (!isRequestAdmin(req)) {
    return res.status(403).json({
      success: false,
      message: 'Admin privileges required'
    });
  }

  return next();
}

module.exports = requireAdmin;
