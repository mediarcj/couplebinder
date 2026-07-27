'use strict';

const crypto = require('node:crypto');
const Stripe = require('stripe');
const logger = require('../utils/logger');
const { config } = require('../config');
const { client: redisClient } = require('../utils/redisClient');

const FRESH_TTL_MS = 5 * 60 * 1000;
const STALE_TTL_MS = 60 * 60 * 1000;
const REDIS_DEADLINE_MS = 200;

const secretKey = String(config?.stripe?.active?.secretKey || '').trim();
let stripe = secretKey
  ? new Stripe(secretKey, {
      apiVersion: config.stripe.apiVersion,
      maxNetworkRetries: 1,
      timeout: 8000,
    })
  : null;

let memoryEntry = null;
const inFlightRefreshes = new Map();
let activePriceIdsOverride = null;

function activePriceIds() {
  if (activePriceIdsOverride) return activePriceIdsOverride.slice();
  return Array.from(new Set(
    [
      config?.stripe?.active?.priceResumeOneTime,
      config?.stripe?.active?.priceResumeExpert,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));
}

function catalogKey(ids) {
  const mode = String(config?.stripe?.mode || 'unknown').toLowerCase();
  const digest = crypto
    .createHash('sha256')
    // Hashing the active credential into the opaque digest partitions accounts without
    // placing the secret itself in Redis keys or logs.
    .update(`${mode}:${secretKey}:${ids.slice().sort().join('|')}`)
    .digest('hex')
    .slice(0, 24);
  return `pricing:catalog:v2:${mode}:${digest}`;
}

function productKeyForPrice(priceId) {
  if (priceId === config?.stripe?.active?.priceResumeOneTime) return 'resume_one_time';
  if (priceId === config?.stripe?.active?.priceResumeExpert) return 'resume_expert';
  return null;
}

function fallbackCatalog(ids) {
  return ids.map((priceId) => ({
    priceId,
    unit_amount: null,
    currency: 'usd',
    isRecurring: false,
    interval: null,
    product_id: null,
    name: null,
    description: null,
    images: [],
    image: null,
    product_metadata: {},
    product_key: productKeyForPrice(priceId),
  }));
}

function withDeadline(operation, milliseconds = REDIS_DEADLINE_MS) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Cache operation timed out')), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function readSharedEntry(key) {
  if (!redisClient?.isOpen) return null;
  try {
    const raw = await withDeadline(redisClient.get(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.value) || !Number.isFinite(parsed.fetchedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeSharedEntry(key, entry) {
  if (!redisClient?.isOpen) return;
  try {
    await withDeadline(
      redisClient.set(key, JSON.stringify(entry), { EX: Math.ceil(STALE_TTL_MS / 1000) })
    );
  } catch {
    // The process-local last-known-good entry remains available when Redis degrades.
  }
}

async function fetchCatalog(ids) {
  if (!stripe) throw new Error('Stripe catalog client is not configured');

  return Promise.all(ids.map(async (priceId) => {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    const product = price.product && typeof price.product !== 'string' ? price.product : null;
    const images = Array.isArray(product?.images) ? product.images : [];

    return {
      priceId,
      unit_amount: price.unit_amount,
      currency: price.currency,
      isRecurring: Boolean(price.recurring),
      interval: price.recurring?.interval || null,
      product_id: product?.id || null,
      name: product?.name || price.nickname || null,
      description: product?.description || null,
      images,
      image: images[0] || null,
      product_metadata: product?.metadata || {},
      product_key: product?.metadata?.product_key || productKeyForPrice(priceId),
    };
  }));
}

function refreshCatalog(key, ids) {
  if (inFlightRefreshes.has(key)) return inFlightRefreshes.get(key);

  const refresh = (async () => {
    const value = await fetchCatalog(ids);
    const entry = { fetchedAt: Date.now(), value };
    memoryEntry = { key, ...entry };
    await writeSharedEntry(key, entry);
    logger.info({ event: 'pricing.catalog.refreshed', count: value.length }, 'Pricing catalog refreshed');
    return value;
  })().finally(() => {
    inFlightRefreshes.delete(key);
  });

  inFlightRefreshes.set(key, refresh);
  return refresh;
}

async function getPricingCatalog() {
  const ids = activePriceIds();
  if (!ids.length) {
    logger.warn({ event: 'pricing.catalog.empty_config' }, 'No active-mode price IDs configured');
    return [];
  }

  const key = catalogKey(ids);
  const now = Date.now();

  if (memoryEntry?.key === key) {
    const age = now - memoryEntry.fetchedAt;
    if (age <= FRESH_TTL_MS) return memoryEntry.value;
    if (age <= STALE_TTL_MS) {
      refreshCatalog(key, ids).catch(() => {});
      return memoryEntry.value;
    }
  }

  const sharedEntry = await readSharedEntry(key);
  if (sharedEntry && now - sharedEntry.fetchedAt <= STALE_TTL_MS) {
    memoryEntry = { key, ...sharedEntry };
    if (now - sharedEntry.fetchedAt > FRESH_TTL_MS) {
      refreshCatalog(key, ids).catch(() => {});
    }
    return sharedEntry.value;
  }

  try {
    return await refreshCatalog(key, ids);
  } catch {
    if (memoryEntry?.key === key && now - memoryEntry.fetchedAt <= STALE_TTL_MS) {
      return memoryEntry.value;
    }
    logger.warn(
      { event: 'pricing.catalog.unavailable' },
      'Stripe pricing is temporarily unavailable; returning a non-authoritative fallback'
    );
    return fallbackCatalog(ids);
  }
}

function getPriceSummary(priceId) {
  if (!priceId || !memoryEntry) return null;
  return memoryEntry.value.find((price) => price.priceId === priceId) || null;
}

function resetForTests() {
  memoryEntry = null;
  inFlightRefreshes.clear();
  activePriceIdsOverride = null;
}

function setStripeClientForTests(client) {
  stripe = client;
  memoryEntry = null;
  inFlightRefreshes.clear();
}

function setActivePriceIdsForTests(ids) {
  activePriceIdsOverride = Array.isArray(ids) ? ids.slice() : null;
  memoryEntry = null;
  inFlightRefreshes.clear();
}

module.exports = {
  getPricingCatalog,
  getPriceSummary,
  _resetForTests: resetForTests,
  _setActivePriceIdsForTests: setActivePriceIdsForTests,
  _setStripeClientForTests: setStripeClientForTests,
};
