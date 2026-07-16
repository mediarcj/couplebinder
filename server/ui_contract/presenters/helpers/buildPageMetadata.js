// Description: Constructs safe, cache-busted page metadata for EJS templates
// Purpose: Keeps title/description/nav logic consistent across presenters

const navManager = require('../../navigation/manager');
const { ASSET_VERSION } = require('../../../config');

function buildPageMetadata(req, res, opts = {}) {
  const nonce = res.locals.nonce || '';
  const assetVersion = ASSET_VERSION || new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

  return {
    title: opts.title || 'Untitled Page',
    description: opts.description || '',
    type: opts.type || 'generic',
    nonce,
    assetVersion,
    nav: navManager.compose(req, res),
  };
}

module.exports = { buildPageMetadata };