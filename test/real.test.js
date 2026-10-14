// -----------------------------------------------------------------------------
// Optional: the integration against a REAL Mealie, through the real HTTP
// transport and the SDK's fake Gladys. Skipped unless MEALIE_URL and
// MEALIE_TOKEN are set (the CI has no Mealie):
//
//   MEALIE_URL=http://127.0.0.1:9925 MEALIE_TOKEN=... npm run test:real
//
// Read only by default. MEALIE_WRITE=1 also adds an item to the first
// shopping list and checks it, and plans a random recipe in 30 days: use a
// test Mealie (nothing is deleted, the item stays checked in its list).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { registerHandlers } from '../src/app.js';
import { WIDGET_KEYS } from '../src/hub.js';

process.env.LOG_LEVEL ??= 'warn';

const { MEALIE_URL, MEALIE_TOKEN, MEALIE_WRITE } = process.env;
const skip = !MEALIE_URL || !MEALIE_TOKEN ? 'MEALIE_URL and MEALIE_TOKEN are not set' : false;

async function start(t) {
  const gladys = createFakeGladys({
    config: { url: MEALIE_URL, api_token: MEALIE_TOKEN, language: 'fr', allow_self_signed: true },
  });
  const app = registerHandlers(gladys, { timers: false });
  await gladys.connect();
  await app.ready;
  t.after(() => app.stop());
  return { gladys, fake: gladys.fake, hub: app.hub };
}

test('a real Mealie: connection, device, states, widgets, reading actions', { skip }, async (t) => {
  const w = await start(t);
  assert.deepEqual(w.fake.connectionStatus, { connected: true }, JSON.stringify(w.hub.error));
  const [device] = w.fake.discoveredDevices;
  assert.ok(device, 'the household is proposed');
  await w.fake.deviceCreated(device);
  const texts = w.fake.states.filter((state) => typeof state.text === 'string');
  assert.equal(texts.length, 6, 'six meal slots');
  assert.ok(texts.every((state) => state.text.length > 0));
  for (const [key, settings] of [
    [WIDGET_KEYS.MEAL_PLAN, { period: 'today' }],
    [WIDGET_KEYS.MEAL_PLAN, { period: 'week' }],
    [WIDGET_KEYS.SHOPPING_LIST, {}],
  ]) {
    const ack = await w.fake.widgetGet(key, { settings, language: 'fr' });
    assert.equal(ack.success, true, ack.error);
    assert.deepEqual(validateWidgetContent(ack.data.content), []);
  }
  const meals = await w.fake.sceneAction('get_meals', { day: 'today' });
  assert.equal(meals.success, true, meals.error);
  const report = await w.fake.action('test_connection', {});
  assert.match(report.data.message.en, /^Connected to Mealie/);
  t.diagnostic(report.data.message.en);
});

test(
  'a real Mealie: add, check, plan',
  { skip: skip || (MEALIE_WRITE !== '1' && 'MEALIE_WRITE is not 1') },
  async (t) => {
    const w = await start(t);
    const name = `Gladys test ${Date.now()}`;
    const added = await w.fake.sceneAction('add_shopping_item', { item: name });
    assert.equal(added.data.outputs.added, true, added.error);
    const again = await w.fake.sceneAction('add_shopping_item', { item: name.toUpperCase() });
    assert.equal(again.data.outputs.added, false, 'not twice');
    const checked = await w.fake.sceneAction('check_shopping_item', { item: name });
    assert.equal(checked.data.outputs.checked, true, checked.error);
    const planned = await w.fake.sceneAction('add_to_meal_plan', {
      day: 'day_after_tomorrow',
      meal: 'side',
    });
    assert.equal(planned.success, true, planned.error);
    t.diagnostic(JSON.stringify(planned.data.outputs));
  },
);
