import { afterEach, describe, expect, it, vi } from 'vitest';

const logger = require('../utils/logger');

describe('secure logger structured overloads', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts sensitive metadata for object-first warnings', () => {
    const output = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn(
      {
        event: 'security.test',
        token: 'sensitive-token-value',
        userId: 'stable-user-id',
        ip: '203.0.113.10',
      },
      'Safe warning'
    );

    const serialized = output.mock.calls.flat().join(' ');
    expect(serialized).toContain('Safe warning');
    expect(serialized).not.toContain('sensitive-token-value');
    expect(serialized).not.toContain('stable-user-id');
    expect(serialized).not.toContain('203.0.113.10');
  });

  it('redacts error metadata before production serialization', () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error(
      {
        event: 'provider.failure',
        authorization: 'Bearer private-value',
        query: 'session_id=private',
      },
      'Provider failed'
    );

    const serialized = output.mock.calls.flat().join(' ');
    expect(serialized).toContain('Provider failed');
    expect(serialized).not.toContain('private-value');
    expect(serialized).not.toContain('session_id=private');
  });

  it('does not corrupt harmless words that merely contain a sensitive substring', () => {
    const output = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('Returning a non-authoritative fallback');

    const serialized = output.mock.calls.flat().join(' ');
    expect(serialized).toContain('non-authoritative');
  });

  it('routes authentication and profile helpers through the redacting logger', () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.auth('login_attempt', {
      ip: '203.0.113.10',
      requestId: 'request-2',
    });
    logger.profile('profile.update.completed', {
      userId: 'private-user-id',
      fields: ['display_name'],
      operation: 'update',
    });

    const serialized = output.mock.calls.flat().join(' ');
    expect(serialized).not.toContain('203.0.113.10');
    expect(serialized).not.toContain('private-user-id');
  });

  it('drops query strings and dynamic identifiers from logged paths', () => {
    const output = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn(
      {
        event: 'request.rejected',
        path: '/api/users/123e4567-e89b-12d3-a456-426614174000?session_id=private',
      },
      'Request rejected'
    );

    const serialized = output.mock.calls.flat().join(' ');
    expect(serialized).toContain('/api/users/[REDACTED]');
    expect(serialized).not.toContain('session_id');
    expect(serialized).not.toContain('123e4567-e89b-12d3-a456-426614174000');
  });
});
