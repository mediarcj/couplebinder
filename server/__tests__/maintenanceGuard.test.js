// File: server/__tests__/maintenanceGuard.test.js
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

// Mock logger
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

// Mock modules
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
        .expect(503);
      
      expect(response.headers['retry-after']).toBe('120');
      expect(response.body.error).toBe('maintenance_mode');
    });

    it('uses environment fallback when Redis is unavailable', async () => {
      mockRedisClient.isReady = false;
      mockRedisClient.get.mockRejectedValue(new Error('Redis unavailable'));
      
      // Set env fallback to 'on'
      process.env.MAINTENANCE_DEFAULT = 'on';
      
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
      
      await request(app)
        .get('/test')
        .expect(503);
      
      delete process.env.MAINTENANCE_DEFAULT;
    });
  });

  describe('Allowed paths', () => {
    beforeEach(() => {
      mockRedisClient.get.mockResolvedValue('on');
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/health/liveness', (req, res) => res.json({ status: 'ok' }));
      app.get('/health/readiness', (req, res) => res.json({ status: 'ready' }));
      app.get('/.well-known/acme-challenge/test', (req, res) => res.text('challenge'));
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
  });

  describe('IP allowlist', () => {
    beforeEach(() => {
      mockRedisClient.get.mockResolvedValue('on');
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
    });

    it('allows allowlisted IPs during maintenance', async () => {
      await request(app)
        .get('/test')
        .set('CF-Connecting-IP', '127.0.0.1')
        .expect(200);
    });

    it('allows IPv6 allowlisted IPs during maintenance', async () => {
      await request(app)
        .get('/test')
        .set('CF-Connecting-IP', '::1')
        .expect(200);
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

    it('uses maintenance page file when available', async () => {
      const mockPageContent = '<html><body>Custom maintenance page</body></html>';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(mockPageContent);
      
      const response = await request(app)
        .get('/test')
        .expect(503);
      
      expect(response.text).toContain('Custom maintenance page');
    });

    it('falls back to minimal HTML when page file missing', async () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const response = await request(app)
        .get('/test')
        .expect(503);
      
      expect(response.text).toContain('Maintenance Mode');
      expect(response.text).toContain('We\'ll be back soon');
    });
  });

  describe('Error handling', () => {
    it('fails open when maintenance guard throws error', async () => {
      // Mock Redis to throw error
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));
      
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
      
      // Should log error but allow request through
      await request(app)
        .get('/test')
        .expect(200);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'maintenance.guard_error'
        }),
        expect.any(String)
      );
    });
  });

  describe('Logging', () => {
    it('logs maintenance blocks', async () => {
      mockRedisClient.get.mockResolvedValue('on');
      
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
      
      await request(app)
        .get('/test')
        .set('CF-Connecting-IP', '192.168.1.100')
        .expect(503);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'maintenance.block',
          clientIp: '192.168.1.100',
          path: '/test',
          method: 'GET'
        }),
        expect.any(String)
      );
    });

    it('logs allowlist passthrough at debug level', async () => {
      mockRedisClient.get.mockResolvedValue('on');
      
      app.use(createMaintenanceGuard(mockRedisClient));
      app.get('/test', (req, res) => res.json({ success: true }));
      
      await request(app)
        .get('/test')
        .set('CF-Connecting-IP', '127.0.0.1')
        .expect(200);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'maintenance.allow_passthrough',
          clientIp: '127.0.0.1'
        }),
        expect.any(String)
      );
    });
  });
});
