// Description: Central authority for product roles from verified JWT claims
// Purpose: Normalize one immutable, request-local role result after cryptographic verification
// Security: Browser data, user metadata, profile rows, and database role rows are never inputs

'use strict';

const ROLE_ORDER = Object.freeze([
  'admin',
  'user'
]);

const ALLOWED_ROLES = new Set(ROLE_ORDER);

const SOURCE_SHAPES = Object.freeze({
  canonical: 'app_metadata.roles',
  legacyAppMetadata: 'app_metadata.role',
  legacyTopLevel: 'user_role',
  none: 'none'
});

const requestAuthorities = new WeakMap();

function hasOwn(object, property) {
  return Boolean(
    object &&
    typeof object === 'object' &&
    Object.prototype.hasOwnProperty.call(object, property)
  );
}

function normalizeRole(value, allowSuperUserAsAdmin) {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();

  if (
    normalized === 'super_user' &&
    allowSuperUserAsAdmin
  ) {
    return 'admin';
  }

  return ALLOWED_ROLES.has(normalized)
    ? normalized
    : null;
}

function createResult(
  candidates,
  sourceShape,
  compatibilityUsed,
  allowSuperUserAsAdmin
) {
  const accepted = new Set();

  for (const candidate of candidates) {
    const normalized = normalizeRole(
      candidate,
      allowSuperUserAsAdmin
    );

    if (normalized) accepted.add(normalized);
  }

  const roles = Object.freeze(
    ROLE_ORDER.filter((role) => accepted.has(role))
  );

  return Object.freeze({
    roles,
    isAdmin: roles.includes('admin'),
    sourceShape,
    compatibilityUsed
  });
}

const EMPTY_RESULT = createResult(
  [],
  SOURCE_SHAPES.none,
  false,
  false
);

/**
 * Normalize product roles from claims that have already passed JWT verification.
 *
 * Canonical claim presence takes precedence even when its value is empty or
 * malformed. This prevents a malformed canonical shape from silently falling
 * through to a legacy elevation path.
 */
function resolveVerifiedProductRoles(
  verifiedClaims,
  compatibility = {}
) {
  if (
    !verifiedClaims ||
    typeof verifiedClaims !== 'object'
  ) {
    return EMPTY_RESULT;
  }

  const appMetadata =
    verifiedClaims.app_metadata &&
    typeof verifiedClaims.app_metadata === 'object'
      ? verifiedClaims.app_metadata
      : {};

  const allowSuperUserAsAdmin =
    compatibility.superUserAsAdmin === true;

  if (hasOwn(appMetadata, 'roles')) {
    const candidates = Array.isArray(appMetadata.roles)
      ? appMetadata.roles
      : [];

    return createResult(
      candidates,
      SOURCE_SHAPES.canonical,
      false,
      allowSuperUserAsAdmin
    );
  }

  if (
    compatibility.legacyAppMetadataRole === true &&
    hasOwn(appMetadata, 'role')
  ) {
    return createResult(
      [appMetadata.role],
      SOURCE_SHAPES.legacyAppMetadata,
      true,
      allowSuperUserAsAdmin
    );
  }

  if (
    compatibility.legacyTopLevelUserRole === true &&
    hasOwn(verifiedClaims, 'user_role')
  ) {
    return createResult(
      [verifiedClaims.user_role],
      SOURCE_SHAPES.legacyTopLevel,
      true,
      allowSuperUserAsAdmin
    );
  }

  return EMPTY_RESULT;
}

/**
 * Resolve and retain only the minimal role result for this verified request.
 * The WeakMap does not retain raw claims or create request-external role state.
 */
function attachVerifiedRoleAuthority(
  req,
  verifiedClaims,
  compatibility
) {
  const result = resolveVerifiedProductRoles(
    verifiedClaims,
    compatibility
  );

  if (req && typeof req === 'object') {
    requestAuthorities.set(req, result);
  }

  return result;
}

function getRequestRoleAuthority(req) {
  if (!req || typeof req !== 'object') {
    return EMPTY_RESULT;
  }

  return requestAuthorities.get(req) || EMPTY_RESULT;
}

function requestHasRole(req, role) {
  if (typeof role !== 'string') return false;

  const normalized = role.trim().toLowerCase();
  if (!ALLOWED_ROLES.has(normalized)) return false;

  return getRequestRoleAuthority(req).roles.includes(normalized);
}

function isRequestAdmin(req) {
  return getRequestRoleAuthority(req).isAdmin;
}

module.exports = {
  SOURCE_SHAPES,
  attachVerifiedRoleAuthority,
  getRequestRoleAuthority,
  isRequestAdmin,
  requestHasRole,
  resolveVerifiedProductRoles
};
