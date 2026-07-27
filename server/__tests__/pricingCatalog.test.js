import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config', () => ({
  config: {
    stripe: {
      mode: 'test',
      apiVersion: '2024-06-20',
      active: {
        secretKey: '',
        priceResumeOneTime: 'price_test_one',
        priceResumeExpert: 'price_test_expert',
      },
      live: {
        priceResumeOneTime: 'price_live_one',
        priceResumeExpert: 'price_live_expert',
      },
    },
  },
}));

vi.mock('../utils/redisClient', () => ({
  client: { isOpen: false },
}));

const catalog = require('../services/pricingCatalog');

function stripeClient() {
  return {
    prices: {
      retrieve: vi.fn(async (priceId) => ({
        id: priceId,
        unit_amount: priceId.endsWith('one') ? 1000 : 2000,
        currency: 'usd',
        recurring: null,
        product: {
          id: `product_${priceId}`,
          name: priceId,
          description: null,
          images: [],
          metadata: {},
        },
      })),
    },
  };
}

describe('pricing catalog lifecycle', () => {
  beforeEach(() => {
    catalog._resetForTests();
    catalog._setActivePriceIdsForTests(['price_test_one', 'price_test_expert']);
  });

  it('uses only active-mode IDs and caches a warm result', async () => {
    const stripe = stripeClient();
    catalog._setStripeClientForTests(stripe);

    const first = await catalog.getPricingCatalog();
    const second = await catalog.getPricingCatalog();

    expect(first).toEqual(second);
    expect(stripe.prices.retrieve).toHaveBeenCalledTimes(2);
    expect(stripe.prices.retrieve).not.toHaveBeenCalledWith(
      'price_live_one',
      expect.anything()
    );
  });

  it('coalesces concurrent cold refreshes', async () => {
    const stripe = stripeClient();
    catalog._setStripeClientForTests(stripe);

    const [first, second, third] = await Promise.all([
      catalog.getPricingCatalog(),
      catalog.getPricingCatalog(),
      catalog.getPricingCatalog(),
    ]);

    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(stripe.prices.retrieve).toHaveBeenCalledTimes(2);
  });

  it('returns a safe fallback when the initial provider call fails', async () => {
    const stripe = {
      prices: {
        retrieve: vi.fn().mockRejectedValue(new Error('temporary provider failure')),
      },
    };
    catalog._setStripeClientForTests(stripe);

    const result = await catalog.getPricingCatalog();

    expect(result).toHaveLength(2);
    expect(result.every((price) => price.unit_amount === null)).toBe(true);
  });
});
