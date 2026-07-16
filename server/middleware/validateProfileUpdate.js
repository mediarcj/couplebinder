// server/middleware/validateProfileUpdate.js
// Purpose: enforce the same limits your DB enforces; reject bad payloads early with 400.
// Plug this in BEFORE your handler that updates public.profiles.

const logger = require('../utils/logger');

// I am saving `hasOwn` here so the nearby steps can reuse the same value without rebuilding it each time.
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Keep these limits next to the middleware that builds req.profilePatch for profile.js.
const MAX = {
  // These limits mirror the database-facing contract. Checking them here gives the user a
  // useful 400 response before a malformed patch reaches Supabase.
  display_name_override: 100,
  // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
  phone: 32,
  // I am keeping the `profile_title` field in this object so the receiving code can read that value by its expected name.
  profile_title: 140,
  // I am keeping the `profile_description` field in this object so the receiving code can read that value by its expected name.
  profile_description: 2000,
  // I am keeping the `social` field in this object so the receiving code can read that value by its expected name.
  social: 140,
  // I am keeping the `language` field in this object so the receiving code can read that value by its expected name.
  language: 50,
  // I am keeping the `city_province` field in this object so the receiving code can read that value by its expected name.
  city_province: 100,
  // I am keeping the `country` field in this object so the receiving code can read that value by its expected name.
  country: 100,
  // I am keeping the `hobbies` field in this object so the receiving code can read that value by its expected name.
  hobbies: 200,
  // I am keeping the `music` field in this object so the receiving code can read that value by its expected name.
  music: 200,
  // I am keeping the `fav_food` field in this object so the receiving code can read that value by its expected name.
  fav_food: 100,
  // I am keeping the `locale` field in this object so the receiving code can read that value by its expected name.
  locale: 10,
  // I am keeping the `timezone` field in this object so the receiving code can read that value by its expected name.
  timezone: 50,
  // I am keeping the `given_name` field in this object so the receiving code can read that value by its expected name.
  given_name: 50,
  // I am keeping the `family_name` field in this object so the receiving code can read that value by its expected name.
  family_name: 50,
  // I am keeping the `avatar_url` field in this object so the receiving code can read that value by its expected name.
  avatar_url: 500,
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am saving `ALLOWED_PRIVACY` here so the nearby steps can reuse the same value without rebuilding it each time.
const ALLOWED_PRIVACY = new Set(['public', 'private']);
// I am saving `ALLOWED_GENDERS` here so the nearby steps can reuse the same value without rebuilding it each time.
const ALLOWED_GENDERS = new Set(['male', 'female']);
// I am saving `ALLOWED_RELATIONSHIP_STATUS` here so the nearby steps can reuse the same value without rebuilding it each time.
const ALLOWED_RELATIONSHIP_STATUS = new Set(['single', 'married']);
// I am saving `ALLOWED_JOB_STATUS` here so the nearby steps can reuse the same value without rebuilding it each time.
const ALLOWED_JOB_STATUS = new Set(['unemployed', 'employed']);

/** Normalize strings (trim; empty -> null) */
function norm(s) {
  // Preserve the difference between a missing key and a supplied empty value handled by callers.
  if (s === undefined || s === null) return null;
  // I am saving `t` here so the nearby steps can reuse the same value without rebuilding it each time.
  const t = String(s).trim();
  // This return sends the completed value or response back to the code that called this function.
  return t.length ? t : null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/** length check helper */
function tooLong(s, max) {
  // This return sends the completed value or response back to the code that called this function.
  return s && s.length > max;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from validateProfileUpdate.js.
module.exports = function validateProfileUpdate(req, res, next) {
  // Build an allowlisted patch rather than forwarding req.body. Missing fields stay
  // untouched, while explicitly supplied empty values can be normalized to null.
  // 1. Copy only supported keys into a normalized patch.
  // 2. Parse current and legacy privacy shapes into one boolean.
  // 3. Collect length/enum/date errors, then attach the safe patch for profile.js.
  try {
    // I am saving `body` here so the nearby steps can reuse the same value without rebuilding it each time.
    const body = req.body || {};
    // Log field names only, never values (PII protection)
    logger.debug({ fields: Object.keys(body || {}), requestId: req.requestId }, 'profile.validate.received');

        // Build a sanitized patch object; only include fields that have actual values
        const patch = {};
        
        // Only add fields that are present in the request body
        // Identity/contact fields remain null when the user explicitly clears their input.
        if (body.display_name_override !== undefined) patch.display_name_override = norm(body.display_name_override);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.phone !== undefined) patch.phone = norm(body.phone);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.birthday !== undefined) patch.birthday = body.birthday ? String(body.birthday) : null;
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.gender !== undefined) patch.gender = norm(body.gender);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.language !== undefined) patch.language = norm(body.language);
        // Location fields use the same trimmed string normalization before database limits.
        if (body.city_province !== undefined) patch.city_province = norm(body.city_province);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.country !== undefined) patch.country = norm(body.country);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.social_media1 !== undefined) patch.social_media1 = norm(body.social_media1);
        // Keep the three existing social slots separate because the profile schema stores them separately.
        if (body.social_media2 !== undefined) patch.social_media2 = norm(body.social_media2);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.social_media3 !== undefined) patch.social_media3 = norm(body.social_media3);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.relationship_status !== undefined) patch.relationship_status = norm(body.relationship_status);
        // Preference/about fields are validated as their current database-facing string shape.
        if (body.job !== undefined) patch.job = norm(body.job);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.hobbies !== undefined) patch.hobbies = norm(body.hobbies);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.music !== undefined) patch.music = norm(body.music);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.fav_food !== undefined) patch.fav_food = norm(body.fav_food);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.profile_title !== undefined) patch.profile_title = norm(body.profile_title);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.profile_description !== undefined) patch.profile_description = norm(body.profile_description);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.locale !== undefined) patch.locale = norm(body.locale);
        // Locale/timezone are accepted for non-UI API clients as well as profile-edit.js.
        if (body.timezone !== undefined) patch.timezone = norm(body.timezone);
        // --- Strict parse for is_private ---
        if (hasOwn(body, 'is_private')) {
            // hasOwn lets false remain a real supplied value rather than looking missing.
            const v = body.is_private;
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (typeof v === 'boolean') {
                // I am keeping this line here because the surrounding validateProfileUpdate.js workflow expects this value or operation before it continues.
                patch.is_private = v;
            // I am checking this next possibility only because the earlier condition did not choose its path.
            } else if (typeof v === 'string') {
                // I am saving `s` here so the nearby steps can reuse the same value without rebuilding it each time.
                const s = v.toLowerCase().trim();
                // This check helps me choose or stop the next path before any work that depends on this condition runs.
                if (['true','1','yes','y'].includes(s)) patch.is_private = true;
                // I am checking this next possibility only because the earlier condition did not choose its path.
                else if (['false','0','no','n'].includes(s)) patch.is_private = false;
                // This alternative runs only when the condition above did not use its first path.
                else {
                    // This return sends the completed value or response back to the code that called this function.
                    return res.status(400).json({
                        // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
                        ok: false,
                        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
                        error: 'validation_failed',
                        // I am keeping the `details` field in this object so the receiving code can read that value by its expected name.
                        details: ['is_private must be a boolean (true/false)'],
                    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                    });
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                }
            // I am checking this next possibility only because the earlier condition did not choose its path.
            } else if (typeof v === 'number') {
                // Retain the historical numeric form; only exactly 1 maps to private.
                patch.is_private = (v === 1);
            // This alternative runs only when the condition above did not use its first path.
            } else {
                // This return sends the completed value or response back to the code that called this function.
                return res.status(400).json({
                    // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
                    ok: false,
                    // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
                    error: 'validation_failed',
                    // I am keeping the `details` field in this object so the receiving code can read that value by its expected name.
                    details: ['is_private has invalid type'],
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                });
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }

        // --- Backward-compat mapping: account_privacy string -> is_private boolean ---
        if (hasOwn(body, 'account_privacy')) {
            // Older clients send a readable enum that maps onto the current boolean column.
            const ap = String(body.account_privacy).toLowerCase().trim();
            // This check helps me choose or stop the next path before any work that depends on this condition runs.
            if (ap === 'public') {
                // I am keeping this line here because the surrounding validateProfileUpdate.js workflow expects this value or operation before it continues.
                patch.is_private = false;
            // I am checking this next possibility only because the earlier condition did not choose its path.
            } else if (ap === 'private') {
                // I am keeping this line here because the surrounding validateProfileUpdate.js workflow expects this value or operation before it continues.
                patch.is_private = true;
            // This alternative runs only when the condition above did not use its first path.
            } else {
                // This return sends the completed value or response back to the code that called this function.
                return res.status(400).json({
                    // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
                    ok: false,
                    // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
                    error: 'validation_failed',
                    // I am keeping the `details` field in this object so the receiving code can read that value by its expected name.
                    details: ['account_privacy must be one of: public, private'],
                // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
                });
            // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
            }
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.given_name !== undefined) patch.given_name = norm(body.given_name);
        // These direct name/avatar fields support trusted API clients and service compatibility.
        if (body.family_name !== undefined) patch.family_name = norm(body.family_name);
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (body.avatar_url !== undefined) patch.avatar_url = norm(body.avatar_url);

    // Collect every field error in one pass so the form can show all corrections at once.
    // Length validations mirror DB constraints and apply only to supplied fields.
    const errors = [];

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.display_name_override !== undefined && tooLong(patch.display_name_override, MAX.display_name_override)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`display_name_override must be <= ${MAX.display_name_override} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.phone !== undefined && tooLong(patch.phone, MAX.phone)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`phone must be <= ${MAX.phone} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.profile_title !== undefined && tooLong(patch.profile_title, MAX.profile_title)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`profile_title must be <= ${MAX.profile_title} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.profile_description !== undefined && tooLong(patch.profile_description, MAX.profile_description)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`profile_description must be <= ${MAX.profile_description} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // Social links share one size limit but keep field-specific messages for the caller.
    if (patch.social_media1 !== undefined && tooLong(patch.social_media1, MAX.social)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`social_media1 must be <= ${MAX.social} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.social_media2 !== undefined && tooLong(patch.social_media2, MAX.social)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`social_media2 must be <= ${MAX.social} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.social_media3 !== undefined && tooLong(patch.social_media3, MAX.social)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`social_media3 must be <= ${MAX.social} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.language !== undefined && tooLong(patch.language, MAX.language)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`language must be <= ${MAX.language} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.city_province !== undefined && tooLong(patch.city_province, MAX.city_province)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`city_province must be <= ${MAX.city_province} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.country !== undefined && tooLong(patch.country, MAX.country)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`country must be <= ${MAX.country} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // Preference strings have different schema limits even though the UI displays them similarly.
    if (patch.hobbies !== undefined && tooLong(patch.hobbies, MAX.hobbies)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`hobbies must be <= ${MAX.hobbies} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.music !== undefined && tooLong(patch.music, MAX.music)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`music must be <= ${MAX.music} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.fav_food !== undefined && tooLong(patch.fav_food, MAX.fav_food)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`fav_food must be <= ${MAX.fav_food} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.locale !== undefined && tooLong(patch.locale, MAX.locale)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`locale must be <= ${MAX.locale} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.timezone !== undefined && tooLong(patch.timezone, MAX.timezone)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`timezone must be <= ${MAX.timezone} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // Direct identity/avatar fields finish the same supplied-only length pass.
    if (patch.given_name !== undefined && tooLong(patch.given_name, MAX.given_name)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`given_name must be <= ${MAX.given_name} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.family_name !== undefined && tooLong(patch.family_name, MAX.family_name)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`family_name must be <= ${MAX.family_name} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.avatar_url !== undefined && tooLong(patch.avatar_url, MAX.avatar_url)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push(`avatar_url must be <= ${MAX.avatar_url} chars`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Enum validations - only validate fields that are present
    if (patch.gender !== undefined && patch.gender && !ALLOWED_GENDERS.has(patch.gender)) {
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      errors.push(`gender must be one of: ${Array.from(ALLOWED_GENDERS).join(', ')}`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.relationship_status !== undefined && patch.relationship_status && !ALLOWED_RELATIONSHIP_STATUS.has(patch.relationship_status)) {
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      errors.push(`relationship_status must be one of: ${Array.from(ALLOWED_RELATIONSHIP_STATUS).join(', ')}`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (patch.job !== undefined && patch.job && !ALLOWED_JOB_STATUS.has(patch.job)) {
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      errors.push(`job must be one of: ${Array.from(ALLOWED_JOB_STATUS).join(', ')}`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // birthday simple format check (YYYY-MM-DD) - only validate if present
    if (patch.birthday !== undefined && patch.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(patch.birthday)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      errors.push('birthday must be YYYY-MM-DD');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (errors.length) {
      // Return all ordinary field corrections together before profileSyncService is called.
      return res.status(400).json({
        // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
        ok: false,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: 'validation_failed',
        // I am keeping the `details` field in this object so the receiving code can read that value by its expected name.
        details: errors,
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Log sanitized patch (field names only, no values)
    logger.debug({ fields: Object.keys(patch || {}), requestId: req.requestId }, 'profile.validate.sanitized');
    
    // Downstream profile code reads this sanitized object instead of the original body.
    req.profilePatch = patch;
    // This return sends the completed value or response back to the code that called this function.
    return next();
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (e) {
    // Unexpected coercion/body shapes still become a controlled validation response.
    return res.status(400).json({
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: false,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'invalid_payload',
      // I am keeping the `details` field in this object so the receiving code can read that value by its expected name.
      details: [e.message],
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};