// File: server/__tests__/consoleLogger.format.test.js
// Description: Tests for console logger formatting functionality
// Purpose: Ensure proper object rendering in EVENT blocks
// Notes: Tests that objects are rendered as JSON, not [object Object]

import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import * as consoleLogger from '../utils/consoleLogger.js';

let spy;
beforeEach(() => { 
  spy = vi.spyOn(console, 'log').mockImplementation(() => {}); 
});
afterEach(() => { 
  spy.mockRestore(); 
});

test('pretty event renders object fields as JSON, not [object Object]', () => {
  const record = {
    level: 'info',
    ts: '2025-01-01T00:00:00.000Z',
    event: 'boot.rate_limit_stack',
    rateLimit: { primary: 'cloudflare', secondary: 'redis' }
  };

  // Call the console logger path that renders EVENT blocks
  // The installJsonLogShim intercepts console.log calls with objects that have an 'event' property
  consoleLogger.formatJsonEvent(record);

  const out = spy.mock.calls.map(args => args.join(' ')).join('\n');
  expect(out).toContain('"primary":"cloudflare"');
  expect(out).toContain('"secondary":"redis"');
  expect(out).not.toContain('[object Object]');
});

test('safeStringify handles various value types correctly', () => {
  const testCases = [
    { input: 'string', expected: 'string' },
    { input: 123, expected: '123' },
    { input: true, expected: 'true' },
    { input: null, expected: 'null' },
    { input: undefined, expected: 'undefined' },
    { input: { key: 'value' }, expected: '{"key":"value"}' },
    { input: [1, 2, 3], expected: '[1,2,3]' },
    { input: new Error('test'), expected: 'Error: test' }
  ];

  testCases.forEach(({ input, expected }) => {
    const result = consoleLogger.safeStringify(input);
    expect(result).toBe(expected);
  });
});

test('safeStringify handles unserializable objects gracefully', () => {
  const circularObj = {};
  circularObj.self = circularObj;
  
  const result = consoleLogger.safeStringify(circularObj);
  expect(result).toBe('[Unserializable]');
});
