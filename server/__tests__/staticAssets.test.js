import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const { registerStaticAssets } = require('../bootstrap/staticAssets');

function createApp() {
  const app = express();
  const dynamicMiddleware = vi.fn((_req, res) => {
    res.cookie('should_not_exist', '1');
    res.status(404).end();
  });
  registerStaticAssets(app);
  app.use(dynamicMiddleware);
  return { app, dynamicMiddleware };
}

describe('early static asset delivery', () => {
  it('serves a versioned asset immutably without entering dynamic middleware', async () => {
    const { app, dynamicMiddleware } = createApp();
    const response = await request(app).get('/js/main.js?v=test-build');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(dynamicMiddleware).not.toHaveBeenCalled();
  });

  it('gives unversioned assets a short revalidating lifetime', async () => {
    const { app } = createApp();
    const response = await request(app).get('/css/style.css');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=3600, must-revalidate');
  });
});
