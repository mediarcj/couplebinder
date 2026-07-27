import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const {
  recordTiming,
  requestTiming,
  routeTiming,
  timeAsync,
  timedMiddleware,
} = require('../middleware/requestTiming');

function createResponse() {
  const res = new EventEmitter();
  res.headersSent = false;
  res.headers = {};
  res.setHeader = vi.fn((name, value) => {
    res.headers[name.toLowerCase()] = value;
  });
  res.writeHead = vi.fn(() => {
    res.headersSent = true;
  });
  return res;
}

describe('requestTiming', () => {
  it('emits only fixed privacy-safe metric names', async () => {
    const req = {};
    const res = createResponse();
    const next = vi.fn();

    requestTiming()(req, res, next);
    recordTiming(req, 'profile', 12.345);
    recordTiming(req, 'user-identifier', 99);
    await timeAsync(req, 'jwt', async () => {});
    res.writeHead(200);

    expect(next).toHaveBeenCalledOnce();
    expect(res.headers['server-timing']).toMatch(/profile;dur=12\.3/);
    expect(res.headers['server-timing']).toMatch(/jwt;dur=/);
    expect(res.headers['server-timing']).toMatch(/total;dur=/);
    expect(res.headers['server-timing']).not.toContain('user-identifier');
  });

  it('times middleware until next is called', async () => {
    const req = {};
    const res = createResponse();
    const next = vi.fn();
    const middleware = timedMiddleware('auth', async (_req, _res, done) => {
      await Promise.resolve();
      done();
    });

    middleware(req, res, next);
    await Promise.resolve();

    expect(next).toHaveBeenCalledOnce();
  });

  it('reports time from the post-middleware route boundary', () => {
    const req = {};
    const res = createResponse();

    requestTiming()(req, res, () => {});
    routeTiming(req, res, () => {});
    res.writeHead(200);

    expect(res.headers['server-timing']).toMatch(/route;dur=/);
  });

  it('writes a structured completion log without IP addresses or request URLs', () => {
    const logger = { info: vi.fn() };
    const req = {
      method: 'GET',
      originalUrl: '/private?token=never-log-this',
      ip: '203.0.113.10',
      requestId: 'request-1',
    };
    const res = createResponse();
    res.statusCode = 200;

    requestTiming({ logger })(req, res, () => {});
    res.emit('finish');

    const [metadata] = logger.info.mock.calls[0];
    expect(metadata).toMatchObject({
      event: 'http.request.completed',
      method: 'GET',
      status: 200,
      requestId: 'request-1',
    });
    expect(JSON.stringify(metadata)).not.toContain('/private');
    expect(JSON.stringify(metadata)).not.toContain('203.0.113.10');
  });
});
