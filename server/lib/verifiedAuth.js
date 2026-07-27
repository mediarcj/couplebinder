'use strict';

const verifiedRequests = new WeakMap();

function setVerifiedAuth(req, auth) {
  if (!req || !auth?.token || !auth?.payload) return;
  verifiedRequests.set(req, {
    token: auth.token,
    payload: auth.payload,
    source: auth.source || 'unknown',
  });
}

function getVerifiedAuth(req) {
  return req ? verifiedRequests.get(req) || null : null;
}

module.exports = { getVerifiedAuth, setVerifiedAuth };
