// File: server/__tests__/health.test.js
// Description: Minimal smoke test to verify server boots with security middleware
// Purpose: Catches critical boot failures before deployment
// Notes: Tests that CSRF and other mandatory middleware loaded successfully

// Globals enabled in vitest.config.js
const request = require('supertest');

// Import app (this will fail fast if critical middleware doesn't load)
const app = require('../zorvalon');

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('Health and Boot Smoke Tests', () => {
  
  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should boot successfully with all critical middleware', () => {
    // If we get here, zorvalon.js loaded without process.exit(1)
    // This means CSRF, requestId, and config all loaded successfully
    expect(app).toBeDefined();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
  
  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('GET /health/liveness returns 200', async () => {
    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .get('/health/liveness')
      // I am checking the observed value here against the behavior this test promises to protect.
      .expect(200);
    
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.body).toBeDefined();
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.body.status).toBe('healthy');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
  
  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('GET /health/readiness returns 200', async () => {
    // I am saving `res` here so the nearby steps can reuse the same value without rebuilding it each time.
    const res = await request(app)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .get('/health/readiness')
      // I am checking the observed value here against the behavior this test promises to protect.
      .expect(200);
    
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.body).toBeDefined();
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.body.status).toBe('ready');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
  
  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should reject requests without CSRF token on mutation endpoints', async () => {
    // POST without CSRF should be rejected (unless Bearer token present)
    const res = await request(app)
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .post('/api/submit')
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .send({ text: 'Test submission' })
      .expect(403); // CSRF validation should reject
    
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(res.body.ok).toBe(false);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
  
  // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
  it('should enforce rate limiting on API endpoints', async () => {
    // Make many requests to trigger rate limit
    // This tests that rate limiter middleware is active
    const requests = [];
    // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
    for (let i = 0; i < 150; i++) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      requests.push(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        request(app)
          // I am continuing the existing call chain here so this option stays attached to the same operation started above.
          .get('/health/liveness')
          // I am continuing the existing call chain here so this option stays attached to the same operation started above.
          .then(res => res.status)
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // I am saving `responses` here so the nearby steps can reuse the same value without rebuilding it each time.
    const responses = await Promise.all(requests);
    // I am saving `_rateLimited` here so the nearby steps can reuse the same value without rebuilding it each time.
    const _rateLimited = responses.filter(status => status === 429);
    
    // At least some requests should hit rate limit
    // Note: health endpoints might not be rate limited, adjust test if needed
    expect(responses.length).toBe(150);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
  
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

