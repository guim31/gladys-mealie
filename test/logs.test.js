// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a failure that repeats is logged
// once, and its end once. Never the API token.
// (Adapted from guim31/gladys-pihole.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, FakeMealie, LIST_IDS, TOKEN, createDevice, createWorld } from './helpers/world.js';

/** Capture the lines of the SDK logger at a level. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  assert.ok(
    logs.texts().some((text) => /Connected to Mealie develop at 192\.0\.2\.10:9925/.test(text)),
    logs.texts().join('\n'),
  );
  await createDevice(w);
  logs.clear();

  for (let i = 0; i < 5; i += 1) {
    mealie.addNote(LIST_IDS.COURSES, `Article ${i}`);
    w.clock.advance(3600_000); // "who am I" is read again too
    await w.hub.pollNow();
    await w.fake.widgetGet('shopping_list', { settings: {}, language: 'en' });
  }
  assert.deepEqual(logs.texts(), []);
});

test('a Mealie that stays down is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  logs.clear();

  mealie.failure = 'down';
  for (let i = 0; i < 6; i += 1) {
    w.clock.advance(60_000);
    await w.hub.pollNow();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines[0].stream, 'err');
  assert.match(logs.lines[0].text, /ECONNREFUSED/);

  logs.clear();
  mealie.failure = null;
  await w.hub.pollNow();
  w.clock.advance(60_000);
  await w.hub.pollNow();
  assert.deepEqual(
    logs.texts().map((text) => text.replace(/^.*\] /, '')),
    ['Mealie answers again'],
  );
});

test('a refused token is logged once, never the token itself', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t, {
    mealie: new FakeMealie({ token: 'the-right-one' }),
    config: { ...CONFIG, api_token: TOKEN },
  });
  for (let i = 0; i < 4; i += 1) {
    w.clock.advance(60_000);
    await w.hub.pollNow();
  }
  const warnings = logs.lines.filter((line) => line.stream === 'err');
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.match(warnings[0].text, /API token refused/);
  const all = logs.texts().join('\n');
  assert.ok(!all.includes(TOKEN), 'never the token');
  assert.ok(!all.includes('the-right-one'));
});

test('one line per action of the user', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  await w.fake.sceneAction('add_shopping_item', { item: 'Moutarde' });
  await w.fake.sceneAction('check_shopping_item', { item: 'Pain' });
  await w.fake.sceneAction('add_to_meal_plan', {
    recipe: 'quiche',
    day: 'tomorrow',
    meal: 'lunch',
  });
  await w.fake.sceneAction('get_meals', { day: 'today' });
  assert.deepEqual(
    logs.texts().map((text) => text.replace(/^.*\] /, '')),
    [
      '"Moutarde" added to the shopping list "Courses"',
      '"Pain" checked on the shopping list "Courses"',
      '"Quiche lorraine" added to the meal plan (2026-10-15, lunch)',
    ],
  );
});

test('Gladys refusing the states is logged once', async (t) => {
  const logs = captureLogs(t);
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  await createDevice(w);
  logs.clear();
  w.gladys.publishChangedStates = async () => {
    throw new Error('HTTP 500');
  };
  for (let i = 0; i < 4; i += 1) {
    mealie.addNote(LIST_IDS.COURSES, `Article ${i}`);
    await w.hub.pollNow();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /States refused: HTTP 500/);
});

test('LOG_LEVEL=debug shows each reading; never the token', async (t) => {
  const logs = captureLogs(t, 'debug');
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  await createDevice(w);
  mealie.failure = 'down';
  await w.hub.pollNow();
  await w.hub.pollNow();
  const text = logs.texts().join('\n');
  assert.match(text, /\[DEBUG\].*Read: 7 meal plan entries/);
  assert.match(text, /\[DEBUG\].*still failing/);
  assert.ok(!text.includes(TOKEN), 'never the token');
});
