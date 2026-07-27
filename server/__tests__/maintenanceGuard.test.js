// Description: Unit and integration tests for maintenance guard middleware
// Purpose: Ensure maintenance mode works correctly with Redis/env toggle

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock Redis client
const mockRedisClient = {
  isReady: true,
  get: vi.fn(),
  set: vi.fn(),
  setEx: vi.fn(),
  del: vi.fn()
};

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

// Mock config
const mockConfig = {
  maintenance: {
    key: 'maintenance:mode',
    default: 'off',
    allowlist: ['127.0.0.1', '::1'],
    retryAfter: 120,
    pagePath: '/test/maintenance.html',
    message: 'Test maintenance message'
  }
};

// Mock fs
const mockFs = {
  existsSync: vi.fn(),
  readFileSync: vi.fn()
};

vi.mock('../utils/logger', () => ({
  default: mockLogger
}));

vi.mock('../config', () => ({
  config: mockConfig
}));

vi.mock('fs', () => mockFs);

describe('Maintenance Guard', () => {
  let app;
  let createMaintenanceGuard;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.clientIp = req.get('X-Test-Client-IP') || '198.51.100.30';
      next();
    });
    
    // Import the middleware after mocking
    createMaintenanceGuard = require('../middleware/maintenanceGuard');
    
    // Setup default mocks
    mockRedisClient.isReady = true;
    mockRedisClient.get.mockResolvedValue('off');
    mockFs.existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Basic functionality', () => {
    it('allows requests when maintenance mode is off', async () => {
      mockRedisClient.get.mockResolvedValue('off');
      
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
      
      const response = await request(app)
        .get('/test')
        .expect(200);
      
      expect(response.body.success).toBe(true);
    });

    it('blocks requests when maintenance mode is on', async () => {
      mockRedisClient.get.mockResolvedValue('on');
      
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
      
      const response = await request(app)
        .get('/test')
        .set('Accept', 'application/json')
        .expect(503);
      
      expect(response.headers['retry-after']).toBe('120');
      expect(response.body.error).toBe('maintenance_mode');
    });

    it('uses the immutable configured fallback when Redis is unavailable', async () => {
      mockRedisClient.isReady = false;
      mockRedisClient.get.mockRejectedValue(new Error('Redis unavailable'));
      
      // Mutating process.env after config load must not change the frozen runtime policy.
      process.env.MAINTENANCE_DEFAULT = 'on';
      
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
      
      await request(app)
        .get('/test')
        .expect(200);
      
      delete process.env.MAINTENANCE_DEFAULT;
    });
  });

  describe('Allowed paths', () => {
    beforeEach(() => {
      mockRedisClient.get.mockResolvedValue('on');
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/health/liveness', (req, res) => res.json({ status: 'ok' }));
      app.get('/health/readiness', (req, res) => res.json({ status: 'ready' }));
      app.get('/.well-known/acme-challenge/test', (_req, res) => res.send('challenge'));
      app.post('/api/stripe/webhook', (req, res) => res.status(200).end());
    });

    it('allows health check paths during maintenance', async () => {
      await request(app)
        .get('/health/liveness')
        .expect(200);
      
      await request(app)
        .get('/health/readiness')
        .expect(200);
    });

    it('allows ACME challenge paths during maintenance', async () => {
      await request(app)
        .get('/.well-known/acme-challenge/test')
        .expect(200);
    });
    
    it('allows Stripe webhook during maintenance', async () => {
      await request(app).post('/api/stripe/webhook').send('{}').expect(200);
    });
  });

  describe('IP allowlist', () => {
    beforeEach(() => {
      mockRedisClient.get.mockResolvedValue('on');
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
    });

    it('does not trust a raw Cloudflare IP header', async () => {
      await request(app)
        .get('/test')
        .set('CF-Connecting-IP', '127.0.0.1')
        .expect(503);
    });

    it('does not trust a raw IPv6 Cloudflare IP header', async () => {
      await request(app)
        .get('/test')
        .set('CF-Connecting-IP', '::1')
        .expect(503);
    });

    it('blocks non-allowlisted IPs during maintenance', async () => {
      await request(app)
        .get('/test')
        .set('CF-Connecting-IP', '192.168.1.100')
        .expect(503);
    });
  });

  describe('Content negotiation', () => {
    beforeEach(() => {
      mockRedisClient.get.mockResolvedValue('on');
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
    });

    it('returns JSON response for API requests', async () => {
      const response = await request(app)
        .get('/api/test')
        .expect(503);
      
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body.error).toBe('maintenance_mode');
      expect(response.body.retryAfter).toBe(120);
    });

    it('returns JSON response for requests with JSON Accept header', async () => {
      const response = await request(app)
        .get('/test')
        .set('Accept', 'application/json')
        .expect(503);
      
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body.error).toBe('maintenance_mode');
    });

    it('returns HTML response for browser requests', async () => {
      const response = await request(app)
        .get('/test')
        .set('Accept', 'text/html,application/xhtml+xml')
        .expect(503);
      
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Maintenance Mode');
    });
  });

  describe('Maintenance page', () => {
    beforeEach(() => {
      mockRedisClient.get.mockResolvedValue('on');
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
    });

    it('uses the safe fallback when the configured page is unavailable', async () => {
      const mockPageContent = '<html><body>Custom maintenance page</body></html>';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(mockPageContent);
      
      const response = await request(app)
        .get('/test')
        .expect(503);
      
      expect(response.text).toContain('Maintenance Mode');
    });

    it('falls back to minimal HTML when page file missing', async () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const response = await request(app)
        .get('/test')
        .expect(503);
      
      expect(response.text).toContain('Maintenance Mode');
      expect(response.text).toContain('We will be back soon');
    });
  });

  describe('Error handling', () => {
    it('fails open when maintenance guard throws error', async () => {
      // Mock Redis to throw error
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));
      
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));

      const logger = require('../utils/logger');
      const debug = vi.spyOn(logger, 'debug').mockImplementation(() => {});

      // The immutable configured fallback is off, so a Redis error remains available.
      await request(app)
        .get('/test')
        .expect(200);

      expect(debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'maintenance.redis_check_failed'
        }),
        expect.any(String)
      );
    });
  });

  describe('Logging', () => {
    it('logs maintenance blocks', async () => {
      mockRedisClient.get.mockResolvedValue('on');
      const logger = require('../utils/logger');
      const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
      
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
      
      await request(app)
        .get('/test')
        .set('X-Test-Client-IP', '192.168.1.100')
        .expect(503);
      
      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'maintenance.block',
          clientIp: '192.168.1.100',
          path: '/test',
          method: 'GET'
        }),
        expect.any(String)
      );
    });

    it('ignores spoofed allowlist headers', async () => {
      mockRedisClient.get.mockResolvedValue('on');
      
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
      
      await request(app)
        .get('/test')
        .set('CF-Connecting-IP', '127.0.0.1')
        .expect(503);
    });
  });
});
