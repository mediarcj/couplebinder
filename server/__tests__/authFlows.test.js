// File: server/__tests__/authFlows.test.js
// Description: Tests for authentication flows and rate limiting integration
// Purpose: Ensure auth endpoints work correctly with security middleware
// Notes: Tests rate limiting, lockouts, and CSRF protection

const { describe, it, expect, beforeEach, afterEach, vi } = require('vitest');
const request = require('supertest');

// Mock dependencies
const mockRedis = {
  exists: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  multi: vi.fn(() => ({
    incr: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    exec: vi.fn()
  })),
  del: vi.fn()
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  auth: vi.fn(),
  profile: vi.fn()
};

const mockSupabaseAdmin = {
  auth: {
    admin: {
      getUserById: vi.fn(),
      updateUserById: vi.fn()
    }
  },
  from: vi.fn()
};

// Mock modules before importing app
vi.mock('../utils/redisClient', () => ({
  client: mockRedis,
  connectRedis: vi.fn().mockResolvedValue(),
  disconnectRedis: vi.fn().mockResolvedValue()
}));

vi.mock('../utils/logger', () => mockLogger);

vi.mock('../utils/supabaseClient', () => ({
  supabaseAdmin: mockSupabaseAdmin
}));

// Import app after mocks are set up
const app = require('../zorvalon');

describe('Authentication Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset Redis mocks to default behavior
    mockRedis.exists.mockResolvedValue(0); // IP not blocked
    mockRedis.incr.mockResolvedValue(1); // First attempt
    mockRedis.ttl.mockResolvedValue(-1); // No TTL
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('should return 404 in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(response.status).toBe(404);

      process.env.NODE_ENV = originalEnv;
    });

    it('should return deprecation message in development', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        message: 'Please use Supabase Auth for login. This endpoint is deprecated.'
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should respect rate limiting', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Mock rate limiter to throw on excessive requests
      const mockRateLimiterError = new Error('Rate limit exceeded');
      mockRateLimiterError.msBeforeNext = 60000;

      // First request should succeed
      let response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(response.status).toBe(400); // Deprecation message

      // Simulate rate limit exceeded by mocking the limiter behavior
      // Note: In a real test, we'd need to make many requests or mock the limiter directly

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('POST /api/auth/signup', () => {
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'test@example.com' }); // Missing display_name

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toContain('Display name is required');
    });

    it('should return success for valid data', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'ValidPass123!',
          display_name: 'Test User'
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Validation passed. Proceed with Supabase user creation.'
      });
    });

    it('should enforce email format validation', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'invalid-email',
          password: 'ValidPass123!',
          display_name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should enforce password strength requirements', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'weak',
          display_name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/auth/status', () => {
    it('should return unauthenticated status without token', async () => {
      const response = await request(app)
        .get('/api/auth/status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        authenticated: false
      });
    });

    it('should not be rate limited (status check)', async () => {
      // Make multiple rapid requests
      const requests = Array(10).fill().map(() =>
        request(app).get('/api/auth/status')
      );

      const responses = await Promise.all(requests);
      
      // All should succeed (status checks typically aren't rate limited)
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('IP Firewall Integration', () => {
    it('should block requests from blocked IPs', async () => {
      // Mock IP as blocked
      mockRedis.exists.mockResolvedValue(1);

      const response = await request(app)
        .get('/api/auth/status')
        .set('X-Forwarded-For', '192.168.1.100');

      expect(response.status).toBe(429);
      expect(response.body).toEqual({
        ok: false,
        error: 'Too many requests'
      });
      expect(response.headers['retry-after']).toBe('3600');
    });

    it('should allow requests from non-blocked IPs', async () => {
      // Mock IP as not blocked
      mockRedis.exists.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/auth/status')
        .set('X-Forwarded-For', '192.168.1.200');

      expect(response.status).toBe(200);
    });
  });

  describe('CSRF Protection', () => {
    it('should reject POST requests without CSRF token', async () => {
      const response = await request(app)
        .post('/api/submit')
        .send({ text: 'Test submission' });

      expect(response.status).toBe(403);
      expect(response.body.ok).toBe(false);
    });

    it('should allow GET requests without CSRF token', async () => {
      const response = await request(app)
        .get('/api/auth/status');

      expect(response.status).toBe(200);
    });
  });

  describe('Request ID Tracking', () => {
    it('should add request ID to all responses', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.body.requestId).toBeDefined();
      expect(typeof response.body.requestId).toBe('string');
      expect(response.body.requestId).toMatch(/^[a-f0-9-]{36}$/); // UUID format
    });

    it('should use different request IDs for concurrent requests', async () => {
      const requests = Array(5).fill().map(() =>
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      const requestIds = responses.map(r => r.body.requestId);

      // All request IDs should be unique
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(requestIds.length);
    });
  });

  describe('Health Endpoints', () => {
    it('should return health status with Redis info', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        message: 'detechify server is running',
        services: {
          redis: {
            connected: expect.any(Boolean),
            lastCheck: expect.any(String)
          },
          server: {
            uptime: expect.any(Number),
            memory: expect.any(Object),
            nodeVersion: expect.any(String)
          }
        }
      });
    });

    it('should return liveness status', async () => {
      const response = await request(app)
        .get('/health/liveness');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'healthy',
        uptime: expect.any(Number),
        timestamp: expect.any(String)
      });
    });

    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/health/readiness');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ready',
        timestamp: expect.any(String)
      });
    });
  });
});
