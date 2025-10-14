# Supabase Client Integrity

## Current Version
- **File**: `/js/supabase-client.js`
- **Version**: 2.75.0
- **Integrity**: `sha384-45qrOVpnf5M0Bag+nYAodPVPVvoHObu9rLLcGdAa03sfV3O3aw/0afQsLPOBtSee`
- **Updated**: 2025-10-14T22:36:47.090Z

## Usage in Templates

For additional security, you can add the integrity attribute:

```html
<script src="/js/supabase-client.js" 
        integrity="sha384-45qrOVpnf5M0Bag+nYAodPVPVvoHObu9rLLcGdAa03sfV3O3aw/0afQsLPOBtSee"
        crossorigin="anonymous"
        nonce="<%= page.nonce %>"></script>
```

## Update Process

1. Update @supabase/supabase-js: `npm update @supabase/supabase-js`
2. Run this script: `node scripts/update-supabase-client.js`
3. Test the application to ensure compatibility
4. Commit the updated client file

## Security Benefits

- ✅ No external CDN dependency
- ✅ Controlled asset delivery
- ✅ Subresource Integrity protection
- ✅ Version pinning and tracking
- ✅ Reduced attack surface
