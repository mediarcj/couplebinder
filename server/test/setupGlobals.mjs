// File: server/test/setupGlobals.mjs
// Description: Global test helpers
// Purpose: Make sure vi is defined before any test touches it
// Notes: Provides vitest globals to all tests

import { vi } from 'vitest';
globalThis.vi = vi;

