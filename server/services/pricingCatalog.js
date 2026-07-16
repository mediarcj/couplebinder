// File: server/services/pricingCatalog.js
// Description: Pricing catalog service for Stripe price data
// Purpose: Fetch and cache Stripe price information for display
// Notes: Uses config.stripe.active/live/test exclusively for all Stripe price IDs. Adds top-level product_key for stable matching.

'use strict';

// I am loading `stripe` into `Stripe` so this file can reuse that dependency below.
const Stripe = require('stripe');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');

// I am keeping `pickStripeSecret` as a named helper so the surrounding workflow can call this step when it needs it.
function pickStripeSecret() {
  // This return sends the completed value or response back to the code that called this function.
  return String(
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    config?.stripe?.active?.secretKey ||
    config?.stripe?.secretKey || // legacy fallback if ever present
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    ''
  // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
  ).trim();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am saving `SECRET_KEY` here so the nearby steps can reuse the same value without rebuilding it each time.
const SECRET_KEY = pickStripeSecret();
// I am saving `stripe` here so the nearby steps can reuse the same value without rebuilding it each time.
const stripe = SECRET_KEY ? new Stripe(SECRET_KEY, { apiVersion: config.stripe.apiVersion }) : null;

// Build a map of priceId -> product_key from all known slots (active/live/test + legacy envs)
function buildPriceIdToKeyMap() {
  // I am saving `map` here so the nearby steps can reuse the same value without rebuilding it each time.
  const map = new Map();

  // I am saving `add` here so the nearby steps can reuse the same value without rebuilding it each time.
  const add = (id, key) => {
    // I am saving `v` here so the nearby steps can reuse the same value without rebuilding it each time.
    const v = String(id || '').trim();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (v) map.set(v, key);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // Active (current mode)
  add(config?.stripe?.active?.priceResumeOneTime, 'resume_one_time');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  add(config?.stripe?.active?.priceResumeExpert,  'resume_expert');

  // Live/Test explicitly
  add(config?.stripe?.live?.priceResumeOneTime, 'resume_one_time');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  add(config?.stripe?.live?.priceResumeExpert,  'resume_expert');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  add(config?.stripe?.test?.priceResumeOneTime, 'resume_one_time');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  add(config?.stripe?.test?.priceResumeExpert,  'resume_expert');

  // This return sends the completed value or response back to the code that called this function.
  return map;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am saving `priceIdToKeyMap` here so the nearby steps can reuse the same value without rebuilding it each time.
const priceIdToKeyMap = buildPriceIdToKeyMap();

// In-memory cache
let catalogCache = null;
// I am saving `cacheKey` here so the nearby steps can reuse the same value without rebuilding it each time.
let cacheKey = null;

// I am keeping `currentPriceIdsFromConfig` as a named helper so the surrounding workflow can call this step when it needs it.
function currentPriceIdsFromConfig() {
  // Prefer active; fall back to live/test; ignore empties
  // All price IDs now come from config.stripe.* only (no process.env fallbacks)
  const ids = [
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    config?.stripe?.active?.priceResumeOneTime,
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    config?.stripe?.active?.priceResumeExpert,
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    config?.stripe?.live?.priceResumeOneTime,
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    config?.stripe?.live?.priceResumeExpert,
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    config?.stripe?.test?.priceResumeOneTime,
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    config?.stripe?.test?.priceResumeExpert
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ]
    // I am mapping the collection here so each input item becomes the output shape expected by the next step.
    .map(v => String(v || '').trim())
    // I am filtering the collection here so only items that pass the nearby check continue to the next step.
    .filter(Boolean);

  // This return sends the completed value or response back to the code that called this function.
  return Array.from(new Set(ids));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `buildCacheKey` as a named helper so the surrounding workflow can call this step when it needs it.
function buildCacheKey(ids) {
  // This return sends the completed value or response back to the code that called this function.
  return ids.slice().sort().join('|') || 'none';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am saving `priceIds` here so the nearby steps can reuse the same value without rebuilding it each time.
  const priceIds = currentPriceIdsFromConfig();
  // I am saving `keyNow` here so the nearby steps can reuse the same value without rebuilding it each time.
  const keyNow = buildCacheKey(priceIds);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (catalogCache && cacheKey === keyNow) return catalogCache;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (priceIds.length === 0) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({ event: 'pricing.catalog.empty_config' }, 'No price IDs configured');
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    catalogCache = [];
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    cacheKey = keyNow;
    // This return sends the completed value or response back to the code that called this function.
    return catalogCache;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // If Stripe isn’t configured, return lightweight rows so the UI still renders
  if (!stripe) {
    // I am mapping the collection here so each input item becomes the output shape expected by the next step.
    catalogCache = priceIds.map((priceId) => ({
      // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
      priceId,
      // I am keeping the `unit_amount` field in this object so the receiving code can read that value by its expected name.
      unit_amount: null,
      // I am keeping the `currency` field in this object so the receiving code can read that value by its expected name.
      currency: 'usd',
      // I am keeping the `isRecurring` field in this object so the receiving code can read that value by its expected name.
      isRecurring: false,
      // I am keeping the `interval` field in this object so the receiving code can read that value by its expected name.
      interval: null,
      // I am keeping the `product_id` field in this object so the receiving code can read that value by its expected name.
      product_id: null,
      // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
      name: priceId,
      // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
      description: null,
      // I am keeping the `images` field in this object so the receiving code can read that value by its expected name.
      images: [],
      // I am keeping the `image` field in this object so the receiving code can read that value by its expected name.
      image: null,
      // I am keeping the `product_metadata` field in this object so the receiving code can read that value by its expected name.
      product_metadata: {},
      // I am keeping the `product_key` field in this object so the receiving code can read that value by its expected name.
      product_key: priceIdToKeyMap.get(priceId) || null
    // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
    }));
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    cacheKey = keyNow;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({ event: 'pricing.catalog.no_stripe' }, 'Stripe not configured; returning fallback catalog');
    // This return sends the completed value or response back to the code that called this function.
    return catalogCache;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `catalog` here so the nearby steps can reuse the same value without rebuilding it each time.
    const catalog = await Promise.all(
      // I am mapping the collection here so each input item becomes the output shape expected by the next step.
      priceIds.map(async (priceId) => {
        // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
        try {
          // I am saving `price` here so the nearby steps can reuse the same value without rebuilding it each time.
          const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
          // I am saving `product` here so the nearby steps can reuse the same value without rebuilding it each time.
          const product = (price.product && typeof price.product !== 'string') ? price.product : null;

          // I am saving `name` here so the nearby steps can reuse the same value without rebuilding it each time.
          const name = product?.name || price.nickname || null;
          // I am saving `description` here so the nearby steps can reuse the same value without rebuilding it each time.
          const description = product?.description || null;
          // I am saving `images` here so the nearby steps can reuse the same value without rebuilding it each time.
          const images = Array.isArray(product?.images) ? product.images : [];
          // I am saving `image` here so the nearby steps can reuse the same value without rebuilding it each time.
          const image = images.length > 0 ? images[0] : null;

          // Prefer metadata.product_key; else infer from known price IDs
          const product_key =
            // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
            (product?.metadata && product.metadata.product_key) ||
            // I am calling this helper here so the current workflow performs this step before it moves on.
            priceIdToKeyMap.get(priceId) ||
            // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
            null;

          // This return sends the completed value or response back to the code that called this function.
          return {
            // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
            priceId,
            // I am keeping the `unit_amount` field in this object so the receiving code can read that value by its expected name.
            unit_amount: price.unit_amount,
            // I am keeping the `currency` field in this object so the receiving code can read that value by its expected name.
            currency: price.currency,
            // I am keeping the `isRecurring` field in this object so the receiving code can read that value by its expected name.
            isRecurring: !!price.recurring,
            // I am keeping the `interval` field in this object so the receiving code can read that value by its expected name.
            interval: price.recurring?.interval || null,
            // I am keeping the `product_id` field in this object so the receiving code can read that value by its expected name.
            product_id: product?.id || null,
            // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
            name,
            // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
            description,
            // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
            images,
            // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
            image,
            // I am keeping the `product_metadata` field in this object so the receiving code can read that value by its expected name.
            product_metadata: product?.metadata || {},
            // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
            product_key
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          };
        // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
        } catch (err) {
          // I am calling this helper here so the current workflow performs this step before it moves on.
          logger.warn(
            // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
            { 
              // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
              event: 'pricing.catalog.lookup_failed', 
              // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
              priceId
              // Removed: error: err.message (security: could leak Stripe API details)
            },
            // I am listing this entry here because the surrounding collection processes each allowed value in order.
            'Stripe price lookup failed; using fallback'
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          );
          // This return sends the completed value or response back to the code that called this function.
          return {
            // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
            priceId,
            // I am keeping the `unit_amount` field in this object so the receiving code can read that value by its expected name.
            unit_amount: null,
            // I am keeping the `currency` field in this object so the receiving code can read that value by its expected name.
            currency: 'usd',
            // I am keeping the `isRecurring` field in this object so the receiving code can read that value by its expected name.
            isRecurring: false,
            // I am keeping the `interval` field in this object so the receiving code can read that value by its expected name.
            interval: null,
            // I am keeping the `product_id` field in this object so the receiving code can read that value by its expected name.
            product_id: null,
            // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
            name: priceId,
            // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
            description: null,
            // I am keeping the `images` field in this object so the receiving code can read that value by its expected name.
            images: [],
            // I am keeping the `image` field in this object so the receiving code can read that value by its expected name.
            image: null,
            // I am keeping the `product_metadata` field in this object so the receiving code can read that value by its expected name.
            product_metadata: {},
            // I am keeping the `product_key` field in this object so the receiving code can read that value by its expected name.
            product_key: priceIdToKeyMap.get(priceId) || null
          // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
          };
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      })
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    );

    // I am filtering the collection here so only items that pass the nearby check continue to the next step.
    catalogCache = catalog.filter(Boolean);
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    cacheKey = keyNow;

    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.info({ event: 'pricing.catalog.cached', count: catalogCache.length }, 'Pricing catalog cached');
    // This return sends the completed value or response back to the code that called this function.
    return catalogCache;
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (err) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({ 
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'pricing.catalog.fetch_error'
      // Removed: error: err.message (security: could leak internal details)
    }, 'Failed to fetch pricing catalog');
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    catalogCache = [];
    // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
    cacheKey = keyNow;
    // This return sends the completed value or response back to the code that called this function.
    return catalogCache;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `getPriceSummary` as a named helper so the surrounding workflow can call this step when it needs it.
function getPriceSummary(priceId) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!priceId) return null;
  // This return sends the completed value or response back to the code that called this function.
  return catalogCache?.find(p => p.priceId === priceId) || null;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from pricingCatalog.js.
module.exports = {
  // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
  getPricingCatalog,
  // I am keeping this line here because the surrounding pricingCatalog.js workflow expects this value or operation before it continues.
  getPriceSummary
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};