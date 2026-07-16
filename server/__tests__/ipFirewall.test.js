// File: server/__tests__/ipFirewall.test.js
// Description: Tests for IP firewall middleware
// Purpose: Ensure IP blocking and auto-ban functionality works correctly
// Notes: Tests Redis integration and graceful fallback behavior

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// I am importing `ipFirewall` from `../middleware/ipFirewall` here because ipFirewall.test.js uses it in the steps below.
import { ipFirewall, blockIp, unblockIp, isBlocked } from '../middleware/ipFirewall';

// Mock Redis client
const mockRedis = {
  // I am keeping the `exists` field in this object so the receiving code can read that value by its expected name.
  exists: vi.fn(),
  // I am keeping the `multi` field in this object so the receiving code can read that value by its expected name.
  multi: vi.fn(() => ({
    // I am keeping the `set` field in this object so the receiving code can read that value by its expected name.
    set: vi.fn().mockReturnThis(),
    // I am keeping the `sAdd` field in this object so the receiving code can read that value by its expected name.
    sAdd: vi.fn().mockReturnThis(),
    // I am keeping the `expire` field in this object so the receiving code can read that value by its expected name.
    expire: vi.fn().mockReturnThis(),
    // I am keeping the `del` field in this object so the receiving code can read that value by its expected name.
    del: vi.fn().mockReturnThis(),
    // I am keeping the `sRem` field in this object so the receiving code can read that value by its expected name.
    sRem: vi.fn().mockReturnThis(),
    // I am keeping the `exec` field in this object so the receiving code can read that value by its expected name.
    exec: vi.fn()
  // This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
  })),
  // I am keeping the `set` field in this object so the receiving code can read that value by its expected name.
  set: vi.fn(),
  // I am keeping the `get` field in this object so the receiving code can read that value by its expected name.
  get: vi.fn(),
  // I am keeping the `del` field in this object so the receiving code can read that value by its expected name.
  del: vi.fn()
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// Mock logger
const mockLogger = {
  // I am keeping the `warn` field in this object so the receiving code can read that value by its expected name.
  warn: vi.fn(),
  // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
  error: vi.fn(),
  // I am keeping the `info` field in this object so the receiving code can read that value by its expected name.
  info: vi.fn()
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// Mock modules
vi.mock('../utils/redisClient', () => ({
  // I am keeping the `client` field in this object so the receiving code can read that value by its expected name.
  client: mockRedis
// This punctuation closes or groups the nearby values, and I am leaving this reminder here to mark that boundary clearly.
}));

// I am defining this small callback here so the surrounding API can run it with the value it supplies.
vi.mock('../utils/logger', () => mockLogger);

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('IP Firewall Middleware', () => {
  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  beforeEach(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    vi.clearAllMocks();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
  afterEach(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    vi.resetAllMocks();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('isBlocked', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return true when IP is blocked', async () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedis.exists.mockResolvedValue(1);

      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = await isBlocked('192.168.1.100');

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toBe(true);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockRedis.exists).toHaveBeenCalledWith('ip:block:192.168.1.100');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return false when IP is not blocked', async () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedis.exists.mockResolvedValue(0);

      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = await isBlocked('192.168.1.100');

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toBe(false);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockRedis.exists).toHaveBeenCalledWith('ip:block:192.168.1.100');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return false when Redis is unavailable', async () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedis.exists.mockRejectedValue(new Error('Redis connection failed'));

      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = await isBlocked('192.168.1.100');

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toBe(false);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockLogger.error).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'ip_firewall.check_error',
          // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
          ip: '192.168.1.100'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'IP firewall check failed'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should return false for empty IP', async () => {
      // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
      const result = await isBlocked('');

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(result).toBe(false);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockRedis.exists).not.toHaveBeenCalled();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('blockIp', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should block IP with default TTL', async () => {
      // I am saving `mockExec` here so the nearby steps can reuse the same value without rebuilding it each time.
      const mockExec = vi.fn().mockResolvedValue(['OK', 1, 1]);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedis.multi.mockReturnValue({
        // I am keeping the `set` field in this object so the receiving code can read that value by its expected name.
        set: vi.fn().mockReturnThis(),
        // I am keeping the `sAdd` field in this object so the receiving code can read that value by its expected name.
        sAdd: vi.fn().mockReturnThis(),
        // I am keeping the `expire` field in this object so the receiving code can read that value by its expected name.
        expire: vi.fn().mockReturnThis(),
        // I am keeping the `exec` field in this object so the receiving code can read that value by its expected name.
        exec: mockExec
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await blockIp('192.168.1.100');

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockRedis.multi).toHaveBeenCalled();
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockExec).toHaveBeenCalled();
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockLogger.warn).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'ip_firewall.blocked',
          // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
          ip: '192.168.1.100',
          // I am keeping the `reason` field in this object so the receiving code can read that value by its expected name.
          reason: 'abuse',
          // I am keeping the `ttlSec` field in this object so the receiving code can read that value by its expected name.
          ttlSec: 3600
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'IP blocked for 3600s'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should block IP with custom TTL and reason', async () => {
      // I am saving `mockExec` here so the nearby steps can reuse the same value without rebuilding it each time.
      const mockExec = vi.fn().mockResolvedValue(['OK', 1, 1]);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedis.multi.mockReturnValue({
        // I am keeping the `set` field in this object so the receiving code can read that value by its expected name.
        set: vi.fn().mockReturnThis(),
        // I am keeping the `sAdd` field in this object so the receiving code can read that value by its expected name.
        sAdd: vi.fn().mockReturnThis(),
        // I am keeping the `expire` field in this object so the receiving code can read that value by its expected name.
        expire: vi.fn().mockReturnThis(),
        // I am keeping the `exec` field in this object so the receiving code can read that value by its expected name.
        exec: mockExec
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await blockIp('192.168.1.100', 1800, 'rate-limit-exceeded');

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockLogger.warn).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'ip_firewall.blocked',
          // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
          ip: '192.168.1.100',
          // I am keeping the `reason` field in this object so the receiving code can read that value by its expected name.
          reason: 'rate-limit-exceeded',
          // I am keeping the `ttlSec` field in this object so the receiving code can read that value by its expected name.
          ttlSec: 1800
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'IP blocked for 1800s'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should handle Redis errors gracefully', async () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedis.multi.mockReturnValue({
        // I am keeping the `set` field in this object so the receiving code can read that value by its expected name.
        set: vi.fn().mockReturnThis(),
        // I am keeping the `sAdd` field in this object so the receiving code can read that value by its expected name.
        sAdd: vi.fn().mockReturnThis(),
        // I am keeping the `expire` field in this object so the receiving code can read that value by its expected name.
        expire: vi.fn().mockReturnThis(),
        // I am keeping the `exec` field in this object so the receiving code can read that value by its expected name.
        exec: vi.fn().mockRejectedValue(new Error('Redis error'))
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await blockIp('192.168.1.100');

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockLogger.error).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'ip_firewall.block_error',
          // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
          ip: '192.168.1.100'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Failed to block IP'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('unblockIp', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should unblock IP successfully', async () => {
      // I am saving `mockExec` here so the nearby steps can reuse the same value without rebuilding it each time.
      const mockExec = vi.fn().mockResolvedValue([1, 1]);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedis.multi.mockReturnValue({
        // I am keeping the `del` field in this object so the receiving code can read that value by its expected name.
        del: vi.fn().mockReturnThis(),
        // I am keeping the `sRem` field in this object so the receiving code can read that value by its expected name.
        sRem: vi.fn().mockReturnThis(),
        // I am keeping the `exec` field in this object so the receiving code can read that value by its expected name.
        exec: mockExec
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await unblockIp('192.168.1.100');

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockRedis.multi).toHaveBeenCalled();
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockExec).toHaveBeenCalled();
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockLogger.info).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'ip_firewall.unblocked',
          // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
          ip: '192.168.1.100'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'IP unblocked'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('ipFirewall middleware', () => {
    // I am saving `req` here so the nearby steps can reuse the same value without rebuilding it each time.
    let req, res, next;

    // I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
    beforeEach(() => {
      // I am keeping this line here because the surrounding ipFirewall.test.js workflow expects this value or operation before it continues.
      req = {
        // I am keeping the `clientIp` field in this object so the receiving code can read that value by its expected name.
        clientIp: '192.168.1.100',
        // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
        ip: '192.168.1.100',
        // I am keeping the `originalUrl` field in this object so the receiving code can read that value by its expected name.
        originalUrl: '/api/test',
        // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
        method: 'POST',
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: 'test-request-123'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
      // I am keeping this line here because the surrounding ipFirewall.test.js workflow expects this value or operation before it continues.
      res = {
        // I am keeping the `set` field in this object so the receiving code can read that value by its expected name.
        set: vi.fn(),
        // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
        status: vi.fn().mockReturnThis(),
        // I am keeping the `json` field in this object so the receiving code can read that value by its expected name.
        json: vi.fn()
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      };
      // I am keeping this line here because the surrounding ipFirewall.test.js workflow expects this value or operation before it continues.
      next = vi.fn();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should block requests from blocked IPs', async () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedis.exists.mockResolvedValue(1);

      // I am saving `middleware` here so the nearby steps can reuse the same value without rebuilding it each time.
      const middleware = ipFirewall();
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await middleware(req, res, next);

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.set).toHaveBeenCalledWith('Retry-After', '3600');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.status).toHaveBeenCalledWith(429);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.json).toHaveBeenCalledWith({
        // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
        ok: false,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: 'Too many requests'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(next).not.toHaveBeenCalled();

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockLogger.warn).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'ip_firewall.blocked_attempt',
          // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
          ip: '192.168.1.100',
          // I am keeping the `path` field in this object so the receiving code can read that value by its expected name.
          path: '/api/test',
          // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
          method: 'POST',
          // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
          requestId: 'test-request-123'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Blocked IP attempted access'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should allow requests from non-blocked IPs', async () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedis.exists.mockResolvedValue(0);

      // I am saving `middleware` here so the nearby steps can reuse the same value without rebuilding it each time.
      const middleware = ipFirewall();
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await middleware(req, res, next);

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(next).toHaveBeenCalled();
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.status).not.toHaveBeenCalled();
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(res.json).not.toHaveBeenCalled();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should skip check for unknown IPs', async () => {
      // I am keeping this line here because the surrounding ipFirewall.test.js workflow expects this value or operation before it continues.
      req.clientIp = 'unknown';
      // I am keeping this line here because the surrounding ipFirewall.test.js workflow expects this value or operation before it continues.
      req.ip = 'unknown';

      // I am saving `middleware` here so the nearby steps can reuse the same value without rebuilding it each time.
      const middleware = ipFirewall();
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await middleware(req, res, next);

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(next).toHaveBeenCalled();
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockRedis.exists).not.toHaveBeenCalled();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should continue on Redis errors (fail open)', async () => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedis.exists.mockRejectedValue(new Error('Redis connection failed'));

      // I am saving `middleware` here so the nearby steps can reuse the same value without rebuilding it each time.
      const middleware = ipFirewall();
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await middleware(req, res, next);

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(next).toHaveBeenCalled();
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockLogger.error).toHaveBeenCalledWith(
        // I am calling this helper here so the current workflow performs this step before it moves on.
        expect.objectContaining({
          // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
          event: 'ip_firewall.middleware_error',
          // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
          ip: '192.168.1.100'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }),
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'IP firewall middleware error'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    it('should use fallback IP when clientIp is not available', async () => {
      // I am keeping this line here because the surrounding ipFirewall.test.js workflow expects this value or operation before it continues.
      req.clientIp = undefined;
      // I am calling this helper here so the current workflow performs this step before it moves on.
      mockRedis.exists.mockResolvedValue(0);

      // I am saving `middleware` here so the nearby steps can reuse the same value without rebuilding it each time.
      const middleware = ipFirewall();
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await middleware(req, res, next);

      // I am checking the observed value here against the behavior this test promises to protect.
      expect(mockRedis.exists).toHaveBeenCalledWith('ip:block:192.168.1.100');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(next).toHaveBeenCalled();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
