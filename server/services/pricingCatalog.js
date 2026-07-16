// Description: Pricing catalog service for Stripe price data
// Purpose: Fetch and cache Stripe price information for display
// Notes: Uses config.stripe.active/live/test exclusively for all Stripe price IDs. Adds top-level product_key for stable matching.

'use strict';

const Stripe = require('stripe');
const logger = require('../utils/logger');
const { config } = require('../config');

function pickStripeSecret() {
  return String(
    config?.stripe?.active?.secretKey ||
    config?.stripe?.secretKey || // legacy fallback if ever present
    ''
  ).trim();
}

const SECRET_KEY = pickStripeSecret();
const stripe = SECRET_KEY ? new Stripe(SECRET_KEY, { apiVersion: config.stripe.apiVersion }) : null;

// Build a map of priceId -> product_key from all known slots (active/live/test + legacy envs)
function buildPriceIdToKeyMap() {
  const map = new Map();

  const add = (id, key) => {
    const v = String(id || '').trim();
    if (v) map.set(v, key);
  };

  // Active (current mode)
  add(config?.stripe?.active?.priceResumeOneTime, 'resume_one_time');
  add(config?.stripe?.active?.priceResumeExpert,  'resume_expert');

  // Live/Test explicitly
  add(config?.stripe?.live?.priceResumeOneTime, 'resume_one_time');
  add(config?.stripe?.live?.priceResumeExpert,  'resume_expert');
  add(config?.stripe?.test?.priceResumeOneTime, 'resume_one_time');
  add(config?.stripe?.test?.priceResumeExpert,  'resume_expert');

  return map;
}

const priceIdToKeyMap = buildPriceIdToKeyMap();

// In-memory cache
let catalogCache = null;
let cacheKey = null;

function currentPriceIdsFromConfig() {
  // Prefer active; fall back to live/test; ignore empties
  // All price IDs now come from config.stripe.* only (no process.env fallbacks)
  const ids = [
    config?.stripe?.active?.priceResumeOneTime,
    config?.stripe?.active?.priceResumeExpert,
    config?.stripe?.live?.priceResumeOneTime,
    config?.stripe?.live?.priceResumeExpert,
    config?.stripe?.test?.priceResumeOneTime,
    config?.stripe?.test?.priceResumeExpert
  ]
    .map(v => String(v || '').trim())
    .filter(Boolean);

  return Array.from(new Set(ids));
}

function buildCacheKey(ids) {
  return ids.slice().sort().join('|') || 'none';
}

/**
 * Returns an array of:
 * {
 *   priceId, unit_amount, currency, isRecurring, interval,
 *   product_id, name, description, images, image,
 *   product_metadata, product_key
 * }
 */
async function getPricingCatalog() {
  const priceIds = currentPriceIdsFromConfig();
  const keyNow = buildCacheKey(priceIds);
  if (catalogCache && cacheKey === keyNow) return catalogCache;

  if (priceIds.length === 0) {
    logger.warn({ event: 'pricing.catalog.empty_config' }, 'No price IDs configured');
    catalogCache = [];
    cacheKey = keyNow;
    return catalogCache;
  }

  // If Stripe isn’t configured, return lightweight rows so the UI still renders
  if (!stripe) {
    catalogCache = priceIds.map((priceId) => ({
      priceId,
      unit_amount: null,
      currency: 'usd',
      isRecurring: false,
      interval: null,
      product_id: null,
      name: priceId,
      description: null,
      images: [],
      image: null,
      product_metadata: {},
      product_key: priceIdToKeyMap.get(priceId) || null
    }));
    cacheKey = keyNow;
    logger.warn({ event: 'pricing.catalog.no_stripe' }, 'Stripe not configured; returning fallback catalog');
    return catalogCache;
  }

  try {
    const catalog = await Promise.all(
      priceIds.map(async (priceId) => {
        try {
          const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
          const product = (price.product && typeof price.product !== 'string') ? price.product : null;

          const name = product?.name || price.nickname || null;
          const description = product?.description || null;
          const images = Array.isArray(product?.images) ? product.images : [];
          const image = images.length > 0 ? images[0] : null;

          // Prefer metadata.product_key; else infer from known price IDs
          const product_key =
            (product?.metadata && product.metadata.product_key) ||
            priceIdToKeyMap.get(priceId) ||
            null;

          return {
            priceId,
            unit_amount: price.unit_amount,
            currency: price.currency,
            isRecurring: !!price.recurring,
            interval: price.recurring?.interval || null,
            product_id: product?.id || null,
            name,
            description,
            images,
            image,
            product_metadata: product?.metadata || {},
            product_key
          };
        } catch (err) {
          logger.warn(
            { 
              event: 'pricing.catalog.lookup_failed', 
              priceId
              // The allowlisted price ID is enough context without copying Stripe's raw error text.
            },
            'Stripe price lookup failed; using fallback'
          );
          return {
            priceId,
            unit_amount: null,
            currency: 'usd',
            isRecurring: false,
            interval: null,
            product_id: null,
            name: priceId,
            description: null,
            images: [],
            image: null,
            product_metadata: {},
            product_key: priceIdToKeyMap.get(priceId) || null
          };
        }
      })
    );

    catalogCache = catalog.filter(Boolean);
    cacheKey = keyNow;

    logger.info({ event: 'pricing.catalog.cached', count: catalogCache.length }, 'Pricing catalog cached');
    return catalogCache;
  } catch (err) {
    logger.error({ 
      event: 'pricing.catalog.fetch_error'
      // Keep this fallback log free of provider and configuration details.
    }, 'Failed to fetch pricing catalog');
    catalogCache = [];
    cacheKey = keyNow;
    return catalogCache;
  }
}

function getPriceSummary(priceId) {
  if (!priceId) return null;
  return catalogCache?.find(p => p.priceId === priceId) || null;
}

module.exports = {
  getPricingCatalog,
  getPriceSummary
};
