// ============================================================
// File: server/ui_contract/presenters/helpers/buildPageMetadata.js
// Description: Constructs safe, cache-busted page metadata for EJS templates
// Purpose: Keeps title/description/nav logic consistent across presenters
// ============================================================

const navManager = require('../../navigation/manager');
// I am loading `../../../config` into `ASSET_VERSION` so this file can reuse that dependency below.
const { ASSET_VERSION } = require('../../../config');

// I am keeping `buildPageMetadata` as a named helper so the surrounding workflow can call this step when it needs it.
function buildPageMetadata(req, res, opts = {}) {
  // I am saving `nonce` here so the nearby steps can reuse the same value without rebuilding it each time.
  const nonce = res.locals.nonce || '';
  // I am saving `assetVersion` here so the nearby steps can reuse the same value without rebuilding it each time.
  const assetVersion = ASSET_VERSION || new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
    title: opts.title || 'Untitled Page',
    // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
    description: opts.description || '',
    // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
    type: opts.type || 'generic',
    // I am keeping this line here because the surrounding buildPageMetadata.js workflow expects this value or operation before it continues.
    nonce,
    // I am keeping this line here because the surrounding buildPageMetadata.js workflow expects this value or operation before it continues.
    assetVersion,
    // I am keeping the `nav` field in this object so the receiving code can read that value by its expected name.
    nav: navManager.compose(req, res),
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from buildPageMetadata.js.
module.exports = { buildPageMetadata };