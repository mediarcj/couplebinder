// File: server/services/pricingCatalog.js
// Description: Pricing catalog service for Stripe price data
// Purpose: Fetch and cache Stripe price information for display
// Notes: Backend is source of truth - prices come from Stripe

/**
 * WHAT:
 * Pricing catalog that fetches Stripe price information for allowed price IDs.
 * 
 * WHY:
 * UI needs to display accurate pricing from Stripe without hard-coding.
 * Ensures consistency between Stripe and displayed prices.
 * 
 * HOW:
 * 1. Fetch price and product data from Stripe for allowed price IDs
 * 2. Cache results in memory after first fetch
 * 3. Return formatted pricing data with names, amounts, and recurrence info
 */

const Stripe = require('stripe');
const logger = require('../utils/logger');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-09-30.clover'
});

// In-memory cache for pricing data
let catalogCache = null;

/**
 * WHAT:
 * Fetch pricing catalog from Stripe for allowlisted price IDs.
 * 
 * WHY:
 * Need product names, prices, and recurrence info from Stripe.
 * Cache after first fetch to avoid repeated API calls.
 * 
 * HOW:
 * 1. Retrieve price IDs from environment variables
 * 2. Fetch each price with expanded product data
 * 3. Format and return array of price information
 * 
 * Returns array of price objects with: priceId, unit_amount, currency, isRecurring, interval, name, blurb
 */
async function getPricingCatalog() {
  // Return cached data if available
  if (catalogCache) {
    return catalogCache;
  }

  const priceIds = [
    process.env.STRIPE_PRICE_RESUME_ONE_TIME,
    process.env.STRIPE_PRICE_RESUME_EXPERT
  ].filter(Boolean);

  if (priceIds.length === 0) {
    logger.warn({ event: 'pricing.catalog.empty' }, 'No price IDs configured');
    catalogCache = [];
    return catalogCache;
  }

  try {
    const catalog = await Promise.all(
      priceIds.map(async (priceId) => {
        try {
          const price = await stripe.prices.retrieve(priceId, {
            expand: ['product']
          });

          const product = typeof price.product === 'string' ? null : price.product;
          
          // Extract name from metadata or product name
          const name = product?.metadata?.display_name || 
                      price.metadata?.display_name || 
                      product?.name || 
                      'Product';

          // Extract blurb from metadata
          const blurb = product?.metadata?.blurb || 
                       price.metadata?.blurb || 
                       '';

          return {
            priceId,
            unit_amount: price.unit_amount,
            currency: price.currency,
            isRecurring: !!price.recurring,
            interval: price.recurring?.interval || null,
            name,
            blurb
          };
        } catch (err) {
          logger.error({
            event: 'pricing.catalog.error',
            priceId,
            error: err.message
          }, `Failed to fetch price ${priceId}`);
          return null;
        }
      })
    );

    // Filter out any failed fetches
    catalogCache = catalog.filter(item => item !== null);
    
    logger.info({
      event: 'pricing.catalog.fetched',
      count: catalogCache.length
    }, 'Pricing catalog cached successfully');

    return catalogCache;
  } catch (err) {
    logger.error({
      event: 'pricing.catalog.fetch_error',
      error: err.message
    }, 'Failed to fetch pricing catalog');
    catalogCache = [];
    return catalogCache;
  }
}

/**
 * WHAT:
 * Get pricing summary for a specific price ID.
 * 
 * WHY:
 * Allows lookup of individual price information without fetching entire catalog.
 * 
 * HOW:
 * 1. Fetch catalog if not cached
 * 2. Find matching price by priceId
 * 3. Return price object or null if not found
 * 
 * @param {string} priceId - Stripe price ID to look up
 * @returns {Object|null} Price object or null
 */
function getPriceSummary(priceId) {
  if (!priceId) return null;
  
  return catalogCache?.find(p => p.priceId === priceId) || null;
}

module.exports = {
  getPricingCatalog,
  getPriceSummary
};
