import { describe, expect, it } from 'vitest';

const { serializeForHtmlScript } = require('../utils/serializeForHtmlScript');

describe('serializeForHtmlScript', () => {
  it('round-trips profile data without permitting a script-element breakout', () => {
    const input = {
      display_name: '</script><script>window.compromised=true</script>',
      note: 'A&B\u2028C',
    };

    const serialized = serializeForHtmlScript(input);

    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<script>');
    expect(serialized).not.toContain('&');
    expect(JSON.parse(serialized)).toEqual(input);
  });
});
