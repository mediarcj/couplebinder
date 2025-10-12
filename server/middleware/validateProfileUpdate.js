// server/middleware/validateProfileUpdate.js
// Purpose: enforce the same limits your DB enforces; reject bad payloads early with 400.
// Plug this in BEFORE your handler that updates public.profiles.

const logger = require('../utils/logger');

const MAX = {
  display_name_override: 100,
  phone: 32,
  profile_title: 140,
  profile_description: 2000,
  social: 140,
  language: 50,
  city_province: 100,
  country: 100,
  hobbies: 200,
  music: 200,
  fav_food: 100,
  locale: 10,
  timezone: 50,
  given_name: 50,
  family_name: 50,
  avatar_url: 500,
};

const ALLOWED_PRIVACY = new Set(['public', 'private']);
const ALLOWED_GENDERS = new Set(['male', 'female']);
const ALLOWED_RELATIONSHIP_STATUS = new Set(['single', 'married']);
const ALLOWED_JOB_STATUS = new Set(['unemployed', 'employed']);

/** Normalize strings (trim; empty -> null) */
function norm(s) {
  if (s === undefined || s === null) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}

/** length check helper */
function tooLong(s, max) {
  return s && s.length > max;
}

module.exports = function validateProfileUpdate(req, res, next) {
  try {
    const body = req.body || {};
    // Log field names only, never values (PII protection)
    logger.debug({ fields: Object.keys(body || {}), requestId: req.requestId }, 'profile.validate.received');

        // Build a sanitized patch object; only include fields that have actual values
        const patch = {};
        
        // Only add fields that are present in the request body
        if (body.display_name_override !== undefined) patch.display_name_override = norm(body.display_name_override);
        if (body.phone !== undefined) patch.phone = norm(body.phone);
        if (body.birthday !== undefined) patch.birthday = body.birthday ? String(body.birthday) : null;
        if (body.gender !== undefined) patch.gender = norm(body.gender);
        if (body.language !== undefined) patch.language = norm(body.language);
        if (body.city_province !== undefined) patch.city_province = norm(body.city_province);
        if (body.country !== undefined) patch.country = norm(body.country);
        if (body.social_media1 !== undefined) patch.social_media1 = norm(body.social_media1);
        if (body.social_media2 !== undefined) patch.social_media2 = norm(body.social_media2);
        if (body.social_media3 !== undefined) patch.social_media3 = norm(body.social_media3);
        if (body.relationship_status !== undefined) patch.relationship_status = norm(body.relationship_status);
        if (body.job !== undefined) patch.job = norm(body.job);
        if (body.hobbies !== undefined) patch.hobbies = norm(body.hobbies);
        if (body.music !== undefined) patch.music = norm(body.music);
        if (body.fav_food !== undefined) patch.fav_food = norm(body.fav_food);
        if (body.profile_title !== undefined) patch.profile_title = norm(body.profile_title);
        if (body.profile_description !== undefined) patch.profile_description = norm(body.profile_description);
        if (body.locale !== undefined) patch.locale = norm(body.locale);
        if (body.timezone !== undefined) patch.timezone = norm(body.timezone);
        if (body.account_privacy !== undefined) patch.account_privacy = body.account_privacy ? String(body.account_privacy) : null;
        if (body.given_name !== undefined) patch.given_name = norm(body.given_name);
        if (body.family_name !== undefined) patch.family_name = norm(body.family_name);
        if (body.avatar_url !== undefined) patch.avatar_url = norm(body.avatar_url);

    // Length validations (mirror DB constraints) - only validate fields that are present
    const errors = [];

    if (patch.display_name_override !== undefined && tooLong(patch.display_name_override, MAX.display_name_override)) {
      errors.push(`display_name_override must be <= ${MAX.display_name_override} chars`);
    }
    if (patch.phone !== undefined && tooLong(patch.phone, MAX.phone)) {
      errors.push(`phone must be <= ${MAX.phone} chars`);
    }
    if (patch.profile_title !== undefined && tooLong(patch.profile_title, MAX.profile_title)) {
      errors.push(`profile_title must be <= ${MAX.profile_title} chars`);
    }
    if (patch.profile_description !== undefined && tooLong(patch.profile_description, MAX.profile_description)) {
      errors.push(`profile_description must be <= ${MAX.profile_description} chars`);
    }
    if (patch.social_media1 !== undefined && tooLong(patch.social_media1, MAX.social)) {
      errors.push(`social_media1 must be <= ${MAX.social} chars`);
    }
    if (patch.social_media2 !== undefined && tooLong(patch.social_media2, MAX.social)) {
      errors.push(`social_media2 must be <= ${MAX.social} chars`);
    }
    if (patch.social_media3 !== undefined && tooLong(patch.social_media3, MAX.social)) {
      errors.push(`social_media3 must be <= ${MAX.social} chars`);
    }
    if (patch.language !== undefined && tooLong(patch.language, MAX.language)) {
      errors.push(`language must be <= ${MAX.language} chars`);
    }
    if (patch.city_province !== undefined && tooLong(patch.city_province, MAX.city_province)) {
      errors.push(`city_province must be <= ${MAX.city_province} chars`);
    }
    if (patch.country !== undefined && tooLong(patch.country, MAX.country)) {
      errors.push(`country must be <= ${MAX.country} chars`);
    }
    if (patch.hobbies !== undefined && tooLong(patch.hobbies, MAX.hobbies)) {
      errors.push(`hobbies must be <= ${MAX.hobbies} chars`);
    }
    if (patch.music !== undefined && tooLong(patch.music, MAX.music)) {
      errors.push(`music must be <= ${MAX.music} chars`);
    }
    if (patch.fav_food !== undefined && tooLong(patch.fav_food, MAX.fav_food)) {
      errors.push(`fav_food must be <= ${MAX.fav_food} chars`);
    }
    if (patch.locale !== undefined && tooLong(patch.locale, MAX.locale)) {
      errors.push(`locale must be <= ${MAX.locale} chars`);
    }
    if (patch.timezone !== undefined && tooLong(patch.timezone, MAX.timezone)) {
      errors.push(`timezone must be <= ${MAX.timezone} chars`);
    }
    if (patch.given_name !== undefined && tooLong(patch.given_name, MAX.given_name)) {
      errors.push(`given_name must be <= ${MAX.given_name} chars`);
    }
    if (patch.family_name !== undefined && tooLong(patch.family_name, MAX.family_name)) {
      errors.push(`family_name must be <= ${MAX.family_name} chars`);
    }
    if (patch.avatar_url !== undefined && tooLong(patch.avatar_url, MAX.avatar_url)) {
      errors.push(`avatar_url must be <= ${MAX.avatar_url} chars`);
    }

    // Enum validations - only validate fields that are present
    if (patch.account_privacy !== undefined && patch.account_privacy && !ALLOWED_PRIVACY.has(patch.account_privacy)) {
      errors.push(`account_privacy must be one of: ${Array.from(ALLOWED_PRIVACY).join(', ')}`);
    }
    if (patch.gender !== undefined && patch.gender && !ALLOWED_GENDERS.has(patch.gender)) {
      errors.push(`gender must be one of: ${Array.from(ALLOWED_GENDERS).join(', ')}`);
    }
    if (patch.relationship_status !== undefined && patch.relationship_status && !ALLOWED_RELATIONSHIP_STATUS.has(patch.relationship_status)) {
      errors.push(`relationship_status must be one of: ${Array.from(ALLOWED_RELATIONSHIP_STATUS).join(', ')}`);
    }
    if (patch.job !== undefined && patch.job && !ALLOWED_JOB_STATUS.has(patch.job)) {
      errors.push(`job must be one of: ${Array.from(ALLOWED_JOB_STATUS).join(', ')}`);
    }

    // birthday simple format check (YYYY-MM-DD) - only validate if present
    if (patch.birthday !== undefined && patch.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(patch.birthday)) {
      errors.push('birthday must be YYYY-MM-DD');
    }

    if (errors.length) {
      return res.status(400).json({
        ok: false,
        error: 'validation_failed',
        details: errors,
      });
    }

    // Log sanitized patch (field names only, no values)
    logger.debug({ fields: Object.keys(patch || {}), requestId: req.requestId }, 'profile.validate.sanitized');
    
    // Attach sanitized patch for the handler
    req.profilePatch = patch;
    return next();
  } catch (e) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_payload',
      details: [e.message],
    });
  }
};