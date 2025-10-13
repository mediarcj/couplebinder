# Cloudflare Email Obfuscation vs Strict CSP Fix

**Date:** October 12, 2025  
**Issue:** Email addresses showing as `[email protected]` on production dashboard  
**Environment:** Production only (detechify.com)

---

## Problem

On production (detechify.com), the dashboard page shows email addresses as hyperlinked `[email protected]` instead of the real email address.

**DevTools Console Error:**
```
Refused to load the script 'https://detechify.com/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js' 
because it violates the following Content Security Policy directive: "script-src 'self' 'nonce-...' 'strict-dynamic' https://cdn.jsdelivr.net"
```

**Why It Happens:**
1. Cloudflare's "Email Address Obfuscation" feature is enabled (Scrape Shield)
2. Cloudflare scans HTML responses for email addresses
3. Replaces them with obfuscated versions: `<a href="/cdn-cgi/l/email-protection">[email protected]</a>`
4. Injects `email-decode.min.js` script to decode them client-side
5. Our strict CSP blocks this Cloudflare script
6. Emails stay obfuscated (can't be decoded)

**Why It Only Affects Dashboard Page:**
- Dashboard: Email rendered server-side in EJS (`<%= user.email %>`)
- Cloudflare sees email in HTML source and obfuscates it
- Profile-edit: Email loaded via JavaScript after page load
- Cloudflare doesn't obfuscate JavaScript-loaded content

---

## Solution

**Recommended: Disable Cloudflare Email Obfuscation**

This is a Cloudflare configuration change (no code changes needed).

### Steps

1. **Log in to Cloudflare Dashboard**
   - Go to: https://dash.cloudflare.com
   - Select: detechify.com domain

2. **Navigate to Scrape Shield**
   - Left sidebar: Security → Scrape Shield
   - Or: https://dash.cloudflare.com/[account-id]/detechify.com/security/scrape-shield

3. **Disable Email Address Obfuscation**
   - Find: "Email Address Obfuscation"
   - Toggle: OFF (gray)

4. **Verify Change**
   - Wait 1-2 minutes for cache to clear
   - Visit: https://detechify.com/dashboard
   - Email should now display correctly

### Verification Commands

**Test email display:**
```bash
curl -s https://detechify.com/dashboard -H "Cookie: __Host-sb_session=YOUR_SESSION" | grep -o '<span class="info-value">.*@.*</span>'
```

**Expected (after fix):**
```html
<span class="info-value">user@example.com</span>
```

**Before (broken):**
```html
<span class="info-value"><a href="/cdn-cgi/l/email-protection" class="__cf_email__">[email protected]</a></span>
```

---

## Why This Is The Right Solution

### Option A: Disable Cloudflare Email Obfuscation (RECOMMENDED) ✅

**Pros:**
- No code changes required
- No CSP weakening
- Emails display correctly
- Simple, immediate fix

**Cons:**
- Emails visible to scrapers in HTML source
- But: Emails already visible to authenticated users
- But: Emails not in public pages (dashboard requires auth)

**Security Impact:** NONE (emails only visible to authenticated users)

### Option B: Allow Cloudflare Scripts in CSP (NOT RECOMMENDED) ❌

**Pros:**
- Keeps email obfuscation feature

**Cons:**
- Weakens CSP significantly
- Allows ALL Cloudflare-injected scripts (not just email-decode)
- Opens attack surface
- Violates strict CSP policy

**Security Impact:** HIGH (weakens XSS protections)

### Option C: Server-Side Email Obfuscation (OVERKILL) ❌

**Pros:**
- Full control over obfuscation
- CSP-compliant

**Cons:**
- Unnecessary complexity
- More code to maintain
- Doesn't add security (dashboard requires auth)

**Security Impact:** NONE (but adds complexity)

---

## Why Email Obfuscation Isn't Needed Here

**Cloudflare Email Obfuscation Purpose:**
- Protect public email addresses from scrapers/bots
- Prevent spam/phishing targeting

**Our Dashboard Context:**
- Dashboard requires authentication
- Emails only visible to logged-in users
- Not a public page
- Scrapers can't access without valid session

**Conclusion:**
Email obfuscation provides no security benefit for authenticated pages. It's designed for public contact pages, not user dashboards.

---

## Alternative: Load Email via JavaScript

If you prefer to keep Cloudflare email obfuscation enabled for other pages, you can load the email via JavaScript on the dashboard (like profile-edit does).

**File:** `server/ejs/dashboard.ejs`

**Change:**
```html
<!-- BEFORE (server-side render) -->
<span class="info-value"><%= user.email %></span>

<!-- AFTER (client-side load) -->
<span class="info-value" id="userEmail">Loading...</span>

<script nonce="<%= page.nonce %>">
  // Load email via JS (Cloudflare won't obfuscate)
  document.getElementById('userEmail').textContent = '<%= user.email %>';
</script>
```

**Why This Works:**
- Cloudflare only obfuscates emails in HTML source
- JavaScript-inserted content is not obfuscated
- CSP allows nonce-based inline scripts

**Downside:**
- Adds inline script to every dashboard page
- More complex than just disabling obfuscation

---

## Recommendation

**Disable Cloudflare Email Obfuscation** (Option A)

**Reasons:**
1. Simplest solution (no code changes)
2. No security impact (dashboard requires auth)
3. No CSP weakening
4. Immediate fix
5. Consistent with profile-edit behavior

---

## Testing

### Before Fix
```bash
# Production dashboard shows obfuscated email
curl -s https://detechify.com/dashboard -H "Cookie: ..." | grep email-protection
# Output: <a href="/cdn-cgi/l/email-protection" class="__cf_email__">...
```

### After Fix
```bash
# Production dashboard shows real email
curl -s https://detechify.com/dashboard -H "Cookie: ..." | grep -o 'info-value">.*@.*</span>'
# Output: info-value">user@example.com</span>
```

### DevTools Console
**Before:** CSP violation error for email-decode.min.js  
**After:** No CSP errors, email displays correctly

---

## Summary

**Issue:** Cloudflare email obfuscation blocked by strict CSP  
**Root Cause:** Feature conflict (Cloudflare vs our security policy)  
**Solution:** Disable Cloudflare email obfuscation  
**Impact:** No security impact (dashboard requires auth)  
**Effort:** 5 minutes (configuration change)  
**Code Changes:** None required

**Status:** Configuration change required (Cloudflare Dashboard)

---

**Document Version:** 1.0  
**Last Updated:** October 12, 2025

