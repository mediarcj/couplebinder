// File: server/utils/consoleShim.js
// Issue: "Warning: Accessing non-existent property 'formatConfigSummary' of module exports inside circular dependency"
// Issue: This comes from requiring ./utils/consoleLogger very early to install the console shim and then again for its formatters, while consoleLogger itself pulls in a module that ends up requiring back into this boot path.
// Minimal fix: split the shim into its own tiny module and load that first.

// super-small, no imports that could loop
function installJsonLogShim() {
  const orig = console.log;
  console.log = (...args) => { try { orig.apply(console, args); } catch (_) { /* no-op */ } };
  // keep your real shim logic here (json formatting, etc.)
}
module.exports = { installJsonLogShim };