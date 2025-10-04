// server/middleware/validateProfileUpdate.js
// Purpose: enforce the same limits your DB enforces; reject bad payloads early with 400.
// Plug this in BEFORE your handler that updates public.profiles.

const MAX = {
  display_name_override: 100,
  phone: 32,
  profile_title: 140,
  profile_description: 2000,
  social: 140,
};

const ALLOWED_PRIVACY = new Set(['public', 'private']);

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

    // Build a sanitized patch object; ignore unknown fields
    const patch = {
      display_name_override: norm(body.display_name_override),
      phone: norm(body.phone),
      birthday: body.birthday ? String(body.birthday) : null, // YYYY-MM-DD (validated below)
      gender: norm(body.gender),
      language: norm(body.language),
      city_province: norm(body.city_province),
      country: norm(body.country),
      social_media1: norm(body.social_media1),
      social_media2: norm(body.social_media2),
      social_media3: norm(body.social_media3),
      relationship_status: norm(body.relationship_status),
      job: norm(body.job),
      hobbies: norm(body.hobbies),
      music: norm(body.music),
      fav_food: norm(body.fav_food),
      profile_title: norm(body.profile_title),
      profile_description: norm(body.profile_description),
      locale: norm(body.locale),
      timezone: norm(body.timezone),
      account_privacy: body.account_privacy ? String(body.account_privacy) : null,
      given_name: norm(body.given_name),
      family_name: norm(body.family_name),
      avatar_url: norm(body.avatar_url),
    };

    // Length validations (mirror DB constraints)
    const errors = [];

    if (tooLong(patch.display_name_override, MAX.display_name_override)) {
      errors.push(`display_name_override must be <= ${MAX.display_name_override} chars`);
    }
    if (tooLong(patch.phone, MAX.phone)) {
      errors.push(`phone must be <= ${MAX.phone} chars`);
    }
    if (tooLong(patch.profile_title, MAX.profile_title)) {
      errors.push(`profile_title must be <= ${MAX.profile_title} chars`);
    }
    if (tooLong(patch.profile_description, MAX.profile_description)) {
      errors.push(`profile_description must be <= ${MAX.profile_description} chars`);
    }
    if (tooLong(patch.social_media1, MAX.social)) {
      errors.push(`social_media1 must be <= ${MAX.social} chars`);
    }
    if (tooLong(patch.social_media2, MAX.social)) {
      errors.push(`social_media2 must be <= ${MAX.social} chars`);
    }
    if (tooLong(patch.social_media3, MAX.social)) {
      errors.push(`social_media3 must be <= ${MAX.social} chars`);
    }

    // account_privacy validation
    if (patch.account_privacy && !ALLOWED_PRIVACY.has(patch.account_privacy)) {
      errors.push(`account_privacy must be one of: ${Array.from(ALLOWED_PRIVACY).join(', ')}`);
    }

    // birthday simple format check (YYYY-MM-DD)
    if (patch.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(patch.birthday)) {
      errors.push('birthday must be YYYY-MM-DD');
    }

    if (errors.length) {
      return res.status(400).json({
        ok: false,
        error: 'validation_failed',
        details: errors,
      });
    }

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