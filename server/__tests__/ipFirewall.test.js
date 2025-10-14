// File: server/__tests__/ipFirewall.test.js
// Description: Tests for IP firewall middleware
// Purpose: Ensure IP blocking and auto-ban functionality works correctly
// Notes: Tests Redis integration and graceful fallback behavior

const { describe, it, expect, beforeEach, afterEach, vi } = require('vitest');
const { ipFirewall, blockIp, unblockIp, isBlocked } = require('../middleware/ipFirewall');

// Mock Redis client
const mockRedis = {
  exists: vi.fn(),
  multi: vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    sAdd: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    sRem: vi.fn().mockReturnThis(),
    exec: vi.fn()
  })),
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn()
};

// Mock logger
const mockLogger = {
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn()
};

// Mock modules
vi.mock('../utils/redisClient', () => ({
  client: mockRedis
}));

vi.mock('../utils/logger', () => mockLogger);

describe('IP Firewall Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('isBlocked', () => {
    it('should return true when IP is blocked', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await isBlocked('192.168.1.100');

      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('ip:block:192.168.1.100');
    });

    it('should return false when IP is not blocked', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await isBlocked('192.168.1.100');

      expect(result).toBe(false);
      expect(mockRedis.exists).toHaveBeenCalledWith('ip:block:192.168.1.100');
    });

    it('should return false when Redis is unavailable', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis connection failed'));

      const result = await isBlocked('192.168.1.100');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ip_firewall.check_error',
          ip: '192.168.1.100'
        }),
        'IP firewall check failed'
      );
    });

    it('should return false for empty IP', async () => {
      const result = await isBlocked('');

      expect(result).toBe(false);
      expect(mockRedis.exists).not.toHaveBeenCalled();
    });
  });

  describe('blockIp', () => {
    it('should block IP with default TTL', async () => {
      const mockExec = vi.fn().mockResolvedValue(['OK', 1, 1]);
      mockRedis.multi.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        sAdd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: mockExec
      });

      await blockIp('192.168.1.100');

      expect(mockRedis.multi).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ip_firewall.blocked',
          ip: '192.168.1.100',
          reason: 'abuse',
          ttlSec: 3600
        }),
        'IP blocked for 3600s'
      );
    });

    it('should block IP with custom TTL and reason', async () => {
      const mockExec = vi.fn().mockResolvedValue(['OK', 1, 1]);
      mockRedis.multi.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        sAdd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: mockExec
      });

      await blockIp('192.168.1.100', 1800, 'rate-limit-exceeded');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ip_firewall.blocked',
          ip: '192.168.1.100',
          reason: 'rate-limit-exceeded',
          ttlSec: 1800
        }),
        'IP blocked for 1800s'
      );
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.multi.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        sAdd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error('Redis error'))
      });

      await blockIp('192.168.1.100');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ip_firewall.block_error',
          ip: '192.168.1.100'
        }),
        'Failed to block IP'
      );
    });
  });

  describe('unblockIp', () => {
    it('should unblock IP successfully', async () => {
      const mockExec = vi.fn().mockResolvedValue([1, 1]);
      mockRedis.multi.mockReturnValue({
        del: vi.fn().mockReturnThis(),
        sRem: vi.fn().mockReturnThis(),
        exec: mockExec
      });

      await unblockIp('192.168.1.100');

      expect(mockRedis.multi).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ip_firewall.unblocked',
          ip: '192.168.1.100'
        }),
        'IP unblocked'
      );
    });
  });

  describe('ipFirewall middleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        clientIp: '192.168.1.100',
        ip: '192.168.1.100',
        originalUrl: '/api/test',
        method: 'POST',
        requestId: 'test-request-123'
      };
      res = {
        set: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      next = vi.fn();
    });

    it('should block requests from blocked IPs', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const middleware = ipFirewall();
      await middleware(req, res, next);

      expect(res.set).toHaveBeenCalledWith('Retry-After', '3600');
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        ok: false,
        error: 'Too many requests'
      });
      expect(next).not.toHaveBeenCalled();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ip_firewall.blocked_attempt',
          ip: '192.168.1.100',
          path: '/api/test',
          method: 'POST',
          requestId: 'test-request-123'
        }),
        'Blocked IP attempted access'
      );
    });

    it('should allow requests from non-blocked IPs', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const middleware = ipFirewall();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should skip check for unknown IPs', async () => {
      req.clientIp = 'unknown';
      req.ip = 'unknown';

      const middleware = ipFirewall();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockRedis.exists).not.toHaveBeenCalled();
    });

    it('should continue on Redis errors (fail open)', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis connection failed'));

      const middleware = ipFirewall();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ip_firewall.middleware_error',
          ip: '192.168.1.100'
        }),
        'IP firewall middleware error'
      );
    });

    it('should use fallback IP when clientIp is not available', async () => {
      req.clientIp = undefined;
      mockRedis.exists.mockResolvedValue(0);

      const middleware = ipFirewall();
      await middleware(req, res, next);

      expect(mockRedis.exists).toHaveBeenCalledWith('ip:block:192.168.1.100');
      expect(next).toHaveBeenCalled();
    });
  });
});
