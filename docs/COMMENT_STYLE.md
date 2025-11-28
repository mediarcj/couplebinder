# Comment Style Guide

**Date:** 2025-01-27  
**Purpose:** Standardize documentation style across the Detechify codebase

---

## Preferred Style: WHAT/WHY/HOW Format

The codebase uses a structured WHAT/WHY/HOW comment format for major modules and important functions. This format aligns with the "building laws" style used throughout the project.

### Top-Level Module Headers

At the top of each major module file, use:

```javascript
/**
 * WHAT:
 * One sentence describing what this module does.
 *
 * WHY:
 * One sentence explaining why this module exists and what problem it solves.
 *
 * HOW:
 * One sentence describing the high-level approach or key mechanisms.
 */
```

### Function-Level Headers

For important exported functions or complex helpers, use:

```javascript
/**
 * WHAT:
 * One sentence describing what this function does.
 *
 * WHY:
 * One sentence explaining why this function exists or what problem it solves.
 *
 * HOW:
 * One sentence describing the approach or key implementation details.
 *
 * @param {Type} paramName - Parameter description
 * @returns {Type} Return value description
 */
```

---

## When to Use WHAT/WHY/HOW

### Use WHAT/WHY/HOW for:
- **Top of major modules** (utils, lib, services, middleware)
- **Important exported functions** that are part of the public API
- **Complex helper functions** that have non-obvious logic
- **Security-critical functions** that need clear documentation

### Use JSDoc for:
- **Parameter and return type documentation** (can coexist with WHAT/WHY/HOW)
- **Type information** for TypeScript-like documentation
- **Detailed parameter descriptions** when needed

### Use Simple Comments for:
- **Inline explanations** of non-obvious code
- **Temporary workarounds** or known issues
- **Implementation notes** that don't need full WHAT/WHY/HOW treatment

---

## Examples

### Good: Module Header
```javascript
/**
 * WHAT:
 * Centralized authentication cookie helpers for setting and clearing auth cookies.
 *
 * WHY:
 * Ensures consistent cookie naming and security attributes across the app.
 *
 * HOW:
 * Uses config.auth.cookieName and config.server.nodeEnv to set Secure, HttpOnly, and SameSite correctly.
 */
```

### Good: Function Header
```javascript
/**
 * WHAT:
 * Enqueue an async operation to ensure atomic execution within the queue.
 *
 * WHY:
 * Serializes operations so they run one at a time, preventing race conditions.
 *
 * HOW:
 * Chains operations onto an internal promise queue. If an operation fails,
 * the caller's promise rejects, but the queue chain continues so later operations can execute.
 *
 * @param {Function} operation - Async function to execute atomically
 * @returns {Promise} Promise that resolves with operation result or rejects with operation error
 */
```

### Good: Simple Inline Comment
```javascript
// Never set "domain" attribute - host-only required for __Host- cookies
const opts = { path: '/', httpOnly: true, secure: true };
```

---

## Style Guidelines

1. **Keep it concise:** Each WHAT/WHY/HOW section should be one sentence when possible, or at most 2-3 sentences.

2. **Be specific:** Avoid vague statements like "handles things" - say what it actually does.

3. **Focus on intent:** WHY should explain the business/technical reason, not just restate WHAT.

4. **Implementation details:** HOW should mention key mechanisms but doesn't need to explain every line.

5. **Consistency:** Use the same tone and level of detail across similar modules.

---

## Migration Strategy

- **Key modules updated:** The most critical utility and lib modules have been updated with WHAT/WHY/HOW headers:
  - `server/utils/logger.js`
  - `server/utils/supabaseClient.js`
  - `server/utils/submissionsQueue.js`
  - `server/lib/authCookie.js`

- **Remaining files:** Will be updated incrementally during normal development cycles, not as a "big bang" refactor.

- **New code:** All new modules and major functions should use the WHAT/WHY/HOW format from the start.

---

## Notes

- JSDoc `@param` and `@returns` tags are still encouraged and can coexist with WHAT/WHY/HOW headers.
- Simple inline comments (`//`) are perfectly fine for implementation details.
- The goal is clarity and consistency, not dogmatic adherence to a single format.

