// File: server/__tests__/maintenanceGuard.test.js
// Description: Unit and integration tests for maintenance guard middleware
// Purpose: Ensure maintenance mode works correctly with Redis/env toggle

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// I am importing `request` from `supertest` here because maintenanceGuard.test.js uses it in the steps below.
import request from 'supertest';
// I am importing `express` from `express` here because maintenanceGuard.test.js uses it in the steps below.
import express from 'express';

// Mock Redis client
const mockRedisClient = {
  // I am keeping the `isReady` field in this object so the receiving code can read that value by its expected name.
  isReady: true,
  // I am keeping the `get` field in this object so the receiving code can read that value by its expected name.
  get: vi.fn(),
  // I am keeping the `set` field in this object so the receiving code can read that value by its expected name.
  set: vi.fn(),
  // I am keeping the `setEx` field in this object so the receiving code can read that value by its expected name.
  setEx: vi.fn(),
  // I am keeping the `del` field in this object so the receiving code can read that value by its expected name.
  del: vi.fn()
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// Mock logger
const mockLogger = {
  // I am keeping the `info` field in this object so the receiving code can read that value by its expected name.
  info: vi.fn(),
  // I am keeping the `debug` field in this object so the receiving code can read that value by its expected name.
  debug: vi.fn(),
  // I am keeping the `warn` field in this object so the receiving code can read that value by its expected name.
  warn: vi.fn(),
  // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
  error: vi.fn()
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// Mock config
const mockConfig = {
  // I am keeping the `maintenance` field in this object so the receiving code can read that value by its expected name.
  maintenance: {
    // I am keeping the `key` field in this object so the receiving code can read that value by its expected name.
    key: 'maintenance:mode',
    // This case marks the path for the matching value in the switch that started above.
    default: 'off',
    // I am keeping the `allowlist` field in this object so the receiving code can read that value by its expected name.
    allowlist: ['127.0.0.1', '::1'],
    // I am keeping the `retryAfter` field in this object so the receiving code can read that value by its expected name.
    retryAfter: 120,
    // I am keeping the `pagePath` field in this object so the receiving code can read that value by its expected name.
    pagePath: '/test/maintenance.html',
    // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
    message: 'Test maintenance message'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// Mock fs
const mockFs = {
  // I am keeping the `existsSync` field in this object so the receiving code can read that value by its expected name.
  existsSync: vi.fn(),
  // I am keeping the `readFileSync` field in this object so the receiving code can read that value by its expected name.
  readFileSync: vi.fn()
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// Mock modules
vi.mock('../utils/logger', () => ({
  // This case marks the path for the matching value in the switch that started above.
  default: mockLogger
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
}));

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
vi.mock('../config', () => ({
  // I am keeping the `config` field in this object so the receiving code can read that value by its expected name.
  config: mockConfig
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
}));

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
vi.mock('fs', () => mockFs);

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('Maintenance Guard', () => {
  // I am saving `app` here so the nearby steps can reuse the same value without rebuilding it each time.
  let app;
  // I am saving `createMaintenanceGuard` here so the nearby steps can reuse the same value without rebuilding it each time.
  let createMaintenanceGuard;

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create fresh Express app for each test
    app = express();
    // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
    app.use(express.json());
    
    // Import the middleware after mocking
    createMaintenanceGuard = require('../middleware/maintenanceGuard');
    
    // Setup default mocks
    mockRedisClient.isReady = true;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    mockRedisClient.get.mockResolvedValue('off');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    mockFs.existsSync.mockReturnValue(false);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  afterEach(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    vi.resetAllMocks();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Basic functionality', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('allows requests when maintenance mode is off', async () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedisClient.get.mockResolvedValue('off');
      
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(createMaintenanceGuard(mockRedisClient));
      // This registers the GET `/test` route so Express can send matching requests through the handlers listed here.
      app.get('/test', (req, res) => res.json({ success: true }));
      
      // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
      const response = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(200);
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.body.success).toBe(true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('blocks requests when maintenance mode is on', async () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedisClient.get.mockResolvedValue('on');
      // ensure mock config provides allowedPaths that include the webhook
      const { config } = require('../config');
      // I am keeping this line here because the surrounding maintenanceGuard.test.js workflow expects this value or operation before it continues.
      config.maintenance.allowedPaths = [
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/health/liveness',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/health/readiness',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/health',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/.well-known/acme-challenge/',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        '/api/stripe/webhook'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      ];      
      
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(createMaintenanceGuard(mockRedisClient));
      // This registers the GET `/test` route so Express can send matching requests through the handlers listed here.
      app.get('/test', (req, res) => res.json({ success: true }));
      
      // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
      const response = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(503);
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.headers['retry-after']).toBe('120');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.body.error).toBe('maintenance_mode');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('uses environment fallback when Redis is unavailable', async () => {
      // I am keeping this line here because the surrounding maintenanceGuard.test.js workflow expects this value or operation before it continues.
      mockRedisClient.isReady = false;
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedisClient.get.mockRejectedValue(new Error('Redis unavailable'));
      
      // Set env fallback to 'on'
      process.env.MAINTENANCE_DEFAULT = 'on';
      
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(createMaintenanceGuard(mockRedisClient));
      // This registers the GET `/test` route so Express can send matching requests through the handlers listed here.
      app.get('/test', (req, res) => res.json({ success: true }));
      
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(503);
      
      // I am keeping this line here because the surrounding maintenanceGuard.test.js workflow expects this value or operation before it continues.
      delete process.env.MAINTENANCE_DEFAULT;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Allowed paths', () => {
    // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
    beforeEach(() => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedisClient.get.mockResolvedValue('on');
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(createMaintenanceGuard(mockRedisClient));
      // This registers the GET `/health/liveness` route so Express can send matching requests through the handlers listed here.
      app.get('/health/liveness', (req, res) => res.json({ status: 'ok' }));
      // This registers the GET `/health/readiness` route so Express can send matching requests through the handlers listed here.
      app.get('/health/readiness', (req, res) => res.json({ status: 'ready' }));
      // This registers the GET `/.well-known/acme-challenge/test` route so Express can send matching requests through the handlers listed here.
      app.get('/.well-known/acme-challenge/test', (req, res) => res.text('challenge'));
      // This registers the POST `/api/stripe/webhook` route so Express can send matching requests through the handlers listed here.
      app.post('/api/stripe/webhook', (req, res) => res.status(200).end());
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('allows health check paths during maintenance', async () => {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/health/liveness')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(200);
      
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/health/readiness')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(200);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('allows ACME challenge paths during maintenance', async () => {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/.well-known/acme-challenge/test')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(200);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('allows Stripe webhook during maintenance', async () => {
      // I am checking the observed value here against the behavior this test promises to protect.
      await request(app).post('/api/stripe/webhook').send('{}').expect(200);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('IP allowlist', () => {
    // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
    beforeEach(() => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedisClient.get.mockResolvedValue('on');
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(createMaintenanceGuard(mockRedisClient));
      // This registers the GET `/test` route so Express can send matching requests through the handlers listed here.
      app.get('/test', (req, res) => res.json({ success: true }));
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('allows allowlisted IPs during maintenance', async () => {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('CF-Connecting-IP', '127.0.0.1')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(200);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('allows IPv6 allowlisted IPs during maintenance', async () => {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('CF-Connecting-IP', '::1')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(200);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('blocks non-allowlisted IPs during maintenance', async () => {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('CF-Connecting-IP', '192.168.1.100')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(503);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Content negotiation', () => {
    // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
    beforeEach(() => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedisClient.get.mockResolvedValue('on');
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(createMaintenanceGuard(mockRedisClient));
      // This registers the GET `/test` route so Express can send matching requests through the handlers listed here.
      app.get('/test', (req, res) => res.json({ success: true }));
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('returns JSON response for API requests', async () => {
      // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
      const response = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/api/test')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(503);
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.headers['content-type']).toContain('application/json');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.body.error).toBe('maintenance_mode');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.body.retryAfter).toBe(120);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('returns JSON response for requests with JSON Accept header', async () => {
      // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
      const response = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('Accept', 'application/json')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(503);
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.headers['content-type']).toContain('application/json');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.body.error).toBe('maintenance_mode');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('returns HTML response for browser requests', async () => {
      // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
      const response = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('Accept', 'text/html,application/xhtml+xml')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(503);
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.headers['content-type']).toContain('text/html');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.text).toContain('Maintenance Mode');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Maintenance page', () => {
    // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
    beforeEach(() => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedisClient.get.mockResolvedValue('on');
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(createMaintenanceGuard(mockRedisClient));
      // This registers the GET `/test` route so Express can send matching requests through the handlers listed here.
      app.get('/test', (req, res) => res.json({ success: true }));
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('uses maintenance page file when available', async () => {
      // I am saving `mockPageContent` here so the nearby steps can reuse the same value without rebuilding it each time.
      const mockPageContent = '<html><body>Custom maintenance page</body></html>';
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockFs.existsSync.mockReturnValue(true);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockFs.readFileSync.mockReturnValue(mockPageContent);
      
      // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
      const response = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(503);
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.text).toContain('Custom maintenance page');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('falls back to minimal HTML when page file missing', async () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockFs.existsSync.mockReturnValue(false);
      
      // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
      const response = await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(503);
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.text).toContain('Maintenance Mode');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(response.text).toContain('We\'ll be back soon');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Error handling', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('fails open when maintenance guard throws error', async () => {
      // Mock Redis to throw error
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));
      
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(createMaintenanceGuard(mockRedisClient));
      // This registers the GET `/test` route so Express can send matching requests through the handlers listed here.
      app.get('/test', (req, res) => res.json({ success: true }));
      
      // Should log error but allow request through
      await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(200);
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockLogger.error).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'maintenance.guard_error'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.any(String)
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('Logging', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('logs maintenance blocks', async () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedisClient.get.mockResolvedValue('on');
      
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(createMaintenanceGuard(mockRedisClient));
      // This registers the GET `/test` route so Express can send matching requests through the handlers listed here.
      app.get('/test', (req, res) => res.json({ success: true }));
      
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('CF-Connecting-IP', '192.168.1.100')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(503);
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockLogger.info).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'maintenance.block',
          // I am keeping the `clientIp` field in this object so the receiving code can read that value by its expected name.
          clientIp: '192.168.1.100',
          // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
          path: '/test',
          // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
          method: 'GET'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.any(String)
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('logs allowlist passthrough at debug level', async () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedisClient.get.mockResolvedValue('on');
      
      // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
      app.use(createMaintenanceGuard(mockRedisClient));
      // This registers the GET `/test` route so Express can send matching requests through the handlers listed here.
      app.get('/test', (req, res) => res.json({ success: true }));
      
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await request(app)
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .get('/test')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .set('CF-Connecting-IP', '127.0.0.1')
        // I am checking the observed value here against the behavior this test promises to protect.
        .expect(200);
      
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockLogger.debug).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'maintenance.allow_passthrough',
          // I am keeping the `clientIp` field in this object so the receiving code can read that value by its expected name.
          clientIp: '127.0.0.1'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.any(String)
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
