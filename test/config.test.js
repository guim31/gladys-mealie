// -----------------------------------------------------------------------------
// The configuration as typed by people: addresses copied from the browser,
// tokens pasted with a space, values of the select fields.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseUrl } from '../src/config.js';

test('an address is understood whichever way it is typed', () => {
  const cases = {
    '192.0.2.10:9925': 'http://192.0.2.10:9925',
    ' http://192.0.2.10:9925/ ': 'http://192.0.2.10:9925',
    'https://mealie.example.com/g/home/r/quiche-lorraine': 'https://mealie.example.com',
    'https://mealie.example.com/household/mealplan/planner/view': 'https://mealie.example.com',
    'https://mealie.example.com/shopping-lists/6cfb5367': 'https://mealie.example.com',
    'http://192.0.2.10:9925/api/docs': 'http://192.0.2.10:9925',
    'https://example.com/mealie': 'https://example.com/mealie',
    'https://example.com/mealie/user/profile/api-tokens': 'https://example.com/mealie',
  };
  for (const [typed, expected] of Object.entries(cases)) {
    assert.equal(parseUrl(typed), expected, typed);
  }
});

test('an address with credentials or another scheme is refused', () => {
  for (const typed of [
    '',
    '   ',
    'ftp://192.0.2.10',
    'http://user:pass@192.0.2.10:9925',
    'http://',
  ]) {
    assert.equal(parseUrl(typed), null, typed);
  }
  assert.equal(parseUrl(undefined), null);
});

test('normalized configuration: defaults, a pasted "Bearer " token, unknown values', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: null,
    invalidUrl: false,
    token: '',
    allowSelfSigned: false,
    pollIntervalMs: 300_000,
    language: 'fr',
  });
  assert.deepEqual(
    normalizeConfig({
      url: '192.0.2.10:9925',
      api_token: ' Bearer abc.def \n',
      allow_self_signed: 'true',
      poll_interval: 60,
      language: 'de',
    }),
    {
      url: 'http://192.0.2.10:9925',
      invalidUrl: false,
      token: 'abc.def',
      allowSelfSigned: true,
      pollIntervalMs: 60_000,
      language: 'de',
    },
  );
  const odd = normalizeConfig({ url: 'ftp://x', poll_interval: '7', language: 'it' });
  assert.equal(odd.invalidUrl, true);
  assert.equal(odd.pollIntervalMs, Number(DEFAULT_CONFIG.poll_interval) * 1000);
  assert.equal(odd.language, 'fr');
  assert.deepEqual(normalizeConfig(null).url, null);
});
