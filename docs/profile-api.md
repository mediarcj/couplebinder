# Profile API Documentation

## Overview

The Profile API provides endpoints for managing user profile data with strict validation and security controls. This document covers the privacy-related fields and their behavior.

## Endpoints

### PUT /api/profile/me

Updates the authenticated user's profile data.

#### Request Body

The API accepts profile updates with the following privacy-related fields:

##### `is_private` (Boolean Field)

**Primary field for privacy control**

- **Type**: `boolean`, `string`, or `number`
- **Accepted Values**:
  - **Boolean**: `true`, `false`
  - **String**: `"true"`, `"false"`, `"1"`, `"0"`, `"yes"`, `"no"`, `"y"`, `"n"`
  - **Number**: `1` (true), `0` (false)
- **Validation**: Strict parsing with clear error messages for invalid types
- **Database**: Stored as boolean in `profiles.is_private` column

##### `account_privacy` (Legacy String Field)

**Backward compatibility mapping**

- **Type**: `string`
- **Accepted Values**: `"public"`, `"private"`
- **Mapping**: 
  - `"public"` → `is_private: false`
  - `"private"` → `is_private: true`
- **Validation**: Must be one of the accepted values
- **Database**: Not stored directly; mapped to `is_private` boolean

#### Field Precedence

When both `is_private` and `account_privacy` are provided:

1. **`account_privacy` takes precedence** (explicit UX input wins)
2. `is_private` is overridden by the `account_privacy` mapping
3. Final value is stored in `profiles.is_private` as boolean

#### Response

```json
{
  "success": true,
  "profile": {
    "user_id": "uuid",
    "is_private": false,
    "account_privacy": "public",
    // ... other profile fields
  },
  "unchanged": false
}
```

**Response Fields:**
- `profile.account_privacy`: Canonical string value ("public"/"private") from database view
- `profile.is_private`: Boolean value from database column
- `unchanged`: `true` if no actual changes were detected

#### Error Responses

##### Validation Errors (400)

```json
{
  "ok": false,
  "error": "validation_failed",
  "details": ["is_private must be a boolean (true/false)"]
}
```

**Common validation errors:**
- Invalid `is_private` values: `"foo"`, `null`, `undefined`
- Invalid `account_privacy` values: `"invalid"`, `"hidden"`
- Type mismatches for `is_private`

##### Authentication Errors (401)

```json
{
  "error": "auth_required",
  "message": "Authentication required for this endpoint"
}
```

## Database Schema

### `profiles` Table

```sql
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_private boolean NOT NULL DEFAULT false,
  -- ... other fields
);
```

### Constraints

- `is_private`: NOT NULL, DEFAULT false, CHECK constraint for boolean values
- RLS Policy: `profiles_owner_update` - only row owner can update

### Views

The `v_profiles_full` view provides computed `account_privacy` field:

```sql
SELECT 
  user_id,
  is_private,
  CASE 
    WHEN is_private THEN 'private' 
    ELSE 'public' 
  END as account_privacy,
  -- ... other fields
FROM public.profiles;
```

## Usage Examples

### Set Profile to Private

```bash
curl -X PUT /api/profile/me \
  -H 'Content-Type: application/json' \
  -H 'X-CSRF-Token: <token>' \
  -d '{"is_private": true}'
```

### Set Profile to Public (via legacy field)

```bash
curl -X PUT /api/profile/me \
  -H 'Content-Type: application/json' \
  -H 'X-CSRF-Token: <token>' \
  -d '{"account_privacy": "public"}'
```

### Conflict Resolution Example

```bash
# account_privacy wins over is_private
curl -X PUT /api/profile/me \
  -H 'Content-Type: application/json' \
  -H 'X-CSRF-Token: <token>' \
  -d '{"is_private": true, "account_privacy": "public"}'
# Result: is_private = false (account_privacy takes precedence)
```

## Security Considerations

1. **Authentication Required**: All profile updates require valid authentication
2. **CSRF Protection**: All requests must include valid CSRF token
3. **Row Level Security**: Users can only update their own profile
4. **Input Validation**: Strict type checking prevents injection attacks
5. **PII Protection**: Logs contain field names only, never values

## Migration Notes

### Database Migration

The `is_private` field has the following guardrails:

```sql
-- Ensure defaults & nullability
ALTER TABLE public.profiles
  ALTER COLUMN is_private SET DEFAULT false;

-- Set NOT NULL constraint
ALTER TABLE public.profiles
  ALTER COLUMN is_private SET NOT NULL;

-- Add boolean constraint
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_is_private_boolean_check
  CHECK (is_private IN (true, false));
```

### Rollback Procedure

If rollback is needed:

```sql
-- Remove NOT NULL constraint (if needed)
ALTER TABLE public.profiles
  ALTER COLUMN is_private DROP NOT NULL;

-- Remove boolean constraint (if needed)
ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_is_private_boolean_check;
```

## Testing

### Unit Tests

Comprehensive test coverage for:
- Boolean parsing for `is_private`
- String mapping for `account_privacy`
- Conflict resolution behavior
- Validation error handling

### E2E Tests

Playwright tests verify:
- UI ↔ API round trip
- Toast notifications
- Cancel behavior
- Canonical display values

### Manual Testing Checklist

- [ ] Public → Private toggle works
- [ ] Private → Public toggle works
- [ ] Cancel reverts to original value
- [ ] Display shows "Public"/"Private" (not booleans)
- [ ] Invalid inputs return 400 errors
- [ ] Conflict resolution works correctly
