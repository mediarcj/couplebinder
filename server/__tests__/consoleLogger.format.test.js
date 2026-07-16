// File: server/__tests__/consoleLogger.format.test.js
// Description: Tests for console logger formatting functionality
// Purpose: Ensure proper object rendering in EVENT blocks
// Notes: Tests that objects are rendered as JSON, not [object Object]

import { beforeEach, afterEach, expect, test, vi } from 'vitest';
// I am importing `as` from `../utils/consoleLogger.js` here because consoleLogger.format.test.js uses it in the steps below.
import * as consoleLogger from '../utils/consoleLogger.js';

// I am saving `spy` here so the nearby steps can reuse the same value without rebuilding it each time.
let spy;
// I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
beforeEach(() => { 
  // I am keeping this line here because the surrounding consoleLogger.format.test.js workflow expects this value or operation before it continues.
  spy = vi.spyOn(console, 'log').mockImplementation(() => {}); 
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
// I am registering this test setup or cleanup step here so each related scenario starts in the expected state.
afterEach(() => { 
  // I am calling this helper here so the current workflow performs this step before it moves on.
  spy.mockRestore(); 
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
test('pretty event renders object fields as JSON, not [object Object]', () => {
  // I am saving `record` here so the nearby steps can reuse the same value without rebuilding it each time.
  const record = {
    // I am keeping the `level` field in this object so the receiving code can read that value by its expected name.
    level: 'info',
    // I am keeping the `ts` field in this object so the receiving code can read that value by its expected name.
    ts: '2025-01-01T00:00:00.000Z',
    // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
    event: 'boot.rate_limit_stack',
    // I am keeping the `rateLimit` field in this object so the receiving code can read that value by its expected name.
    rateLimit: { primary: 'cloudflare', secondary: 'redis' }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // Call the console logger path that renders EVENT blocks
  // The installJsonLogShim intercepts console.log calls with objects that have an 'event' property
  consoleLogger.formatJsonEvent(record);

  // I am saving `out` here so the nearby steps can reuse the same value without rebuilding it each time.
  const out = spy.mock.calls.map(args => args.join(' ')).join('\n');
  // I am checking the observed value here against the behavior this test promises to protect.
  expect(out).toContain('"primary":"cloudflare"');
  // I am checking the observed value here against the behavior this test promises to protect.
  expect(out).toContain('"secondary":"redis"');
  // I am checking the observed value here against the behavior this test promises to protect.
  expect(out).not.toContain('[object Object]');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
test('safeStringify handles various value types correctly', () => {
  // I am saving `testCases` here so the nearby steps can reuse the same value without rebuilding it each time.
  const testCases = [
    // I am keeping this line here because the surrounding consoleLogger.format.test.js workflow expects this value or operation before it continues.
    { input: 'string', expected: 'string' },
    // I am keeping this line here because the surrounding consoleLogger.format.test.js workflow expects this value or operation before it continues.
    { input: 123, expected: '123' },
    // I am keeping this line here because the surrounding consoleLogger.format.test.js workflow expects this value or operation before it continues.
    { input: true, expected: 'true' },
    // I am keeping this line here because the surrounding consoleLogger.format.test.js workflow expects this value or operation before it continues.
    { input: null, expected: 'null' },
    // I am keeping this line here because the surrounding consoleLogger.format.test.js workflow expects this value or operation before it continues.
    { input: undefined, expected: 'undefined' },
    // I am keeping this line here because the surrounding consoleLogger.format.test.js workflow expects this value or operation before it continues.
    { input: { key: 'value' }, expected: '{"key":"value"}' },
    // I am keeping this line here because the surrounding consoleLogger.format.test.js workflow expects this value or operation before it continues.
    { input: [1, 2, 3], expected: '[1,2,3]' },
    // I am keeping this line here because the surrounding consoleLogger.format.test.js workflow expects this value or operation before it continues.
    { input: new Error('test'), expected: 'Error: test' }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ];

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  testCases.forEach(({ input, expected }) => {
    // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
    const result = consoleLogger.safeStringify(input);
    // I am checking the observed value here against the behavior this test promises to protect.
    expect(result).toBe(expected);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
test('safeStringify handles unserializable objects gracefully', () => {
  // I am saving `circularObj` here so the nearby steps can reuse the same value without rebuilding it each time.
  const circularObj = {};
  // I am keeping this line here because the surrounding consoleLogger.format.test.js workflow expects this value or operation before it continues.
  circularObj.self = circularObj;
  
  // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
  const result = consoleLogger.safeStringify(circularObj);
  // I am checking the observed value here against the behavior this test promises to protect.
  expect(result).toBe('[Unserializable]');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
