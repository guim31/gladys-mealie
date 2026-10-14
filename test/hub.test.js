// -----------------------------------------------------------------------------
// The hub, end to end: the SDK's fake Gladys on one side, the in-memory Mealie
// (real answers of Mealie 3.28) on the other, a manual clock in Paris. The
// device, its states, the refresh by the integration's own timer, midnight,
// the heartbeat, failures and reconfiguration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS, listFeatureKey } from '../src/devices.js';
import { WIDGET_KEYS } from '../src/hub.js';
import {
  BASE_URL,
  CONFIG,
  FakeMealie,
  LIST_IDS,
  TOKEN,
  createClock,
  createDevice,
  createWorld,
  ids,
  lastText,
} from './helpers/world.js';

async function world(t, options = {}) {
  const result = await createWorld(options);
  t.after(() => result.app.stop());
  return result;
}

const lastState = (w, key) => w.fake.lastState(ids(w.gladys).feature(key));

test('one device for the household, proposed in the Discovery tab, never polled by Gladys', async (t) => {
  const w = await world(t);
  const [device, ...others] = w.fake.discoveredDevices;
  assert.equal(others.length, 0);
  assert.equal(device.name, 'Mealie');
  assert.equal(device.external_id, ids(w.gladys).device);
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  assert.deepEqual(device.params, [{ name: 'MEALIE_HOUSEHOLD', value: 'Family' }]);
  assert.deepEqual(
    device.features.map((feature) => [feature.name, feature.external_id]),
    [
      ['Breakfast today', ids(w.gladys).feature('today_breakfast')],
      ['Lunch today', ids(w.gladys).feature('today_lunch')],
      ['Dinner today', ids(w.gladys).feature('today_dinner')],
      ['Breakfast tomorrow', ids(w.gladys).feature('tomorrow_breakfast')],
      ['Lunch tomorrow', ids(w.gladys).feature('tomorrow_lunch')],
      ['Dinner tomorrow', ids(w.gladys).feature('tomorrow_dinner')],
      ['Recipes', ids(w.gladys).feature('recipes')],
      ['To buy: Bricolage', ids(w.gladys).feature(listFeatureKey(LIST_IDS.BRICOLAGE))],
      ['To buy: Courses', ids(w.gladys).feature(listFeatureKey(LIST_IDS.COURSES))],
    ],
  );
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.equal(w.fake.states.length, 0, 'nothing sent for a device not added');
});

test('once added, the meals, the recipes and the items to buy are published', async (t) => {
  const w = await world(t);
  await createDevice(w);
  assert.equal(lastText(w, FEATURE_KEYS.TODAY_BREAKFAST), 'Pancakes');
  assert.equal(lastText(w, FEATURE_KEYS.TODAY_LUNCH), 'Quiche lorraine');
  assert.equal(lastText(w, FEATURE_KEYS.TODAY_DINNER), 'Bœuf bourguignon');
  assert.equal(lastText(w, FEATURE_KEYS.TOMORROW_BREAKFAST), 'Nothing planned');
  assert.equal(lastText(w, FEATURE_KEYS.TOMORROW_LUNCH), 'Restes', 'a note counts as a meal');
  assert.equal(lastText(w, FEATURE_KEYS.TOMORROW_DINNER), 'Salade niçoise');
  assert.equal(lastState(w, FEATURE_KEYS.RECIPES), 4);
  assert.equal(
    lastState(w, listFeatureKey(LIST_IDS.COURSES)),
    6,
    'the checked flour does not count',
  );
  assert.equal(lastState(w, listFeatureKey(LIST_IDS.BRICOLAGE)), 0);
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: ids(w.gladys).device,
    transport: 'local',
  });
  assert.ok(w.fake.widgetRefreshes.includes(WIDGET_KEYS.SHOPPING_LIST));
  assert.ok(w.fake.widgetRefreshes.includes(WIDGET_KEYS.MEAL_PLAN));
});

test('feature names and the empty slot follow the language of the configuration', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'fr' } });
  await createDevice(w);
  const names = w.fake.discoveredDevices[0].features.map((feature) => feature.name);
  assert.equal(names[0], "Petit-déjeuner aujourd'hui");
  assert.equal(names.at(-1), 'À acheter : Courses');
  assert.equal(lastText(w, FEATURE_KEYS.TOMORROW_BREAKFAST), 'Rien de prévu');
});

test('the integration refreshes itself on its own timer: no onPoll needed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const mealie = new FakeMealie();
  const clock = createClock();
  const w = await world(t, { mealie, clock, timers: true });
  await createDevice(w);
  // Gladys never calls onPoll here: replaced by a counter to prove it.
  const onPoll = t.mock.fn();
  w.gladys.onPoll(onPoll);

  mealie.addNote(LIST_IDS.COURSES, 'Moutarde');
  const before = mealie.requests.length;
  clock.advance(300_000);
  t.mock.timers.tick(300_000);
  await settle(w);
  assert.ok(mealie.requests.length > before, 'Mealie was read again');
  assert.equal(lastState(w, listFeatureKey(LIST_IDS.COURSES)), 7);
  assert.equal(onPoll.mock.callCount(), 0);

  // And again at the next interval.
  mealie.addNote(LIST_IDS.COURSES, 'Sel');
  clock.advance(300_000);
  t.mock.timers.tick(300_000);
  await settle(w);
  assert.equal(lastState(w, listFeatureKey(LIST_IDS.COURSES)), 8);
});

/** Let the readings started by a timer finish. */
async function settle(w) {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await w.hub.polling;
}

test('right after midnight, tomorrow becomes today without waiting for the interval', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = createClock(Date.UTC(2026, 9, 14, 21, 58)); // 23:58 in Paris
  const w = await world(t, { clock, timers: true, config: { ...CONFIG, poll_interval: '900' } });
  await createDevice(w);
  assert.equal(lastText(w, FEATURE_KEYS.TODAY_DINNER), 'Bœuf bourguignon');
  // Midnight is 2 minutes away, the interval 15: the timer fires at midnight + 5 s.
  clock.advance(125_000);
  t.mock.timers.tick(125_000);
  await settle(w);
  assert.equal(lastText(w, FEATURE_KEYS.TODAY_DINNER), 'Salade niçoise');
  assert.equal(lastText(w, FEATURE_KEYS.TOMORROW_DINNER), 'Quiche lorraine');
});

test('only the changes are published, and every value again after six hours', async (t) => {
  // The SDK dates what it published with Date.now(): its clock moves with ours.
  const clock = createClock();
  t.mock.timers.enable({ apis: ['Date'], now: clock.time });
  const advance = clock.advance.bind(clock);
  clock.advance = (ms) => {
    advance(ms);
    t.mock.timers.tick(ms);
  };
  const mealie = new FakeMealie();
  const w = await world(t, { mealie, clock });
  await createDevice(w);
  const count = w.fake.states.length;
  clock.advance(60_000);
  await w.hub.pollNow();
  assert.equal(w.fake.states.length, count, 'nothing changed, nothing sent');

  mealie.addNote(LIST_IDS.BRICOLAGE, 'Vis');
  clock.advance(60_000);
  await w.hub.pollNow();
  assert.deepEqual(w.fake.states.slice(count), [
    {
      device_feature_external_id: ids(w.gladys).feature(listFeatureKey(LIST_IDS.BRICOLAGE)),
      state: 1,
    },
  ]);

  // The heartbeat: Gladys shows "no recent value" on a state older than 48 h.
  clock.advance(6 * 3600_000);
  const sent = w.fake.states.length;
  await w.hub.pollNow();
  assert.equal(w.fake.states.length - sent, 9, 'the nine features again');
});

test('the device added after the first reading gets its states at once', async (t) => {
  const w = await world(t);
  assert.equal(w.fake.states.length, 0);
  await createDevice(w);
  assert.equal(w.fake.states.length, 9);
  // Created again (deleted then added back): everything again.
  await createDevice(w);
  assert.equal(w.fake.states.length, 18);
});

test('a Mealie that stops answering: the badge and the status say it, the values stay', async (t) => {
  const mealie = new FakeMealie();
  const clock = createClock();
  const w = await world(t, { mealie, clock });
  await createDevice(w);
  const count = w.fake.states.length;
  mealie.failure = 'down';
  clock.advance(60_000);
  await w.hub.pollNow();
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(w.fake.connectionStatus.message.en, 'Mealie does not answer');
  assert.equal(w.fake.states.length, count, 'the last values stay');

  mealie.failure = null;
  clock.advance(60_000);
  await w.hub.pollNow();
  assert.equal(w.fake.transports.at(-1).transport, 'local');
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a refused token is a configuration problem, said under the integration name', async (t) => {
  const w = await world(t, { mealie: new FakeMealie({ token: 'another' }) });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /jeton d'API refusé/);
  assert.deepEqual(w.fake.discoveredDevices, [], 'nothing to propose before a first reading');
});

test('Mealie 1.x is refused with an explanation', async (t) => {
  const mealie = Object.assign(new FakeMealie(), { failure: 'v1' });
  const w = await world(t, { mealie });
  assert.match(w.fake.connectionStatus.message.en, /Mealie 2\.0 or later/);
});

test('a new shopping list in Mealie adds its feature to the proposed device', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  await createDevice(w);
  mealie.lists.push({
    ...mealie.lists[0],
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    name: 'Pharmacie',
  });
  await w.hub.pollNow();
  const names = w.fake.discoveredDevices[0].features.map((feature) => feature.name);
  assert.ok(names.includes('To buy: Pharmacie'));
  assert.equal(lastState(w, listFeatureKey('aaaaaaaa-0000-4000-8000-000000000001')), 0);
});

test('two lists with the same name get two distinct feature names', async (t) => {
  const mealie = new FakeMealie();
  mealie.lists.push({ ...mealie.lists[1], id: 'aaaaaaaa-0000-4000-8000-000000000002' });
  const w = await world(t, { mealie });
  const names = w.fake.discoveredDevices[0].features.map((feature) => feature.name);
  assert.ok(names.includes('To buy: Courses'));
  assert.ok(names.includes('To buy: Courses (2)'));
});

test('without an address, the status asks for one; a wrong one is named', async (t) => {
  const w = await world(t, { config: { language: 'en' } });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /Enter the address of your Mealie/);
  assert.deepEqual(w.fake.discoveredDevices, []);
  await w.fake.configUpdated({ url: 'ftp://192.0.2.10', api_token: TOKEN });
  assert.match(w.fake.connectionStatus.message.en, /Address not understood/);
});

test('a new address for the same Mealie keeps the device', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  await createDevice(w);
  const id = w.fake.discoveredDevices[0].external_id;
  // Same server, reached by another name: the fake answers only BASE_URL,
  // so the address keeps the host and adds what the browser shows.
  await w.fake.configUpdated({ ...CONFIG, url: `${BASE_URL}/g/home/shopping-lists` });
  assert.equal(w.fake.discoveredDevices[0].external_id, id);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('onPoll, should Gladys poll anyway, reads Mealie at once', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  await createDevice(w);
  mealie.addNote(LIST_IDS.COURSES, 'Riz');
  const ack = await w.fake.poll(w.fake.discoveredDevices[0]);
  assert.equal(ack.success, true);
  assert.equal(lastState(w, listFeatureKey(LIST_IDS.COURSES)), 7);
});

test('Gladys restarted: the device, the states and the status are sent again', async (t) => {
  const w = await world(t);
  await createDevice(w);
  const states = w.fake.states.length;
  const statuses = w.fake.connectionStatuses.length;
  await w.gladys.disconnect();
  await w.gladys.connect();
  assert.equal(w.fake.states.length - states, 9);
  assert.equal(w.fake.connectionStatuses.length - statuses, 1);
});

test('the reading is light: four requests per cycle, "who am I" once an hour', async (t) => {
  const mealie = new FakeMealie();
  const clock = createClock();
  const w = await world(t, { mealie, clock });
  const before = mealie.requests.length;
  clock.advance(300_000);
  await w.hub.pollNow();
  assert.deepEqual(
    mealie.requests
      .slice(before)
      .map((request) => request.path)
      .sort(),
    [
      'households/mealplans',
      'households/shopping/items',
      'households/shopping/lists',
      'households/statistics',
    ],
  );
  clock.advance(3600_000);
  const again = mealie.requests.length;
  await w.hub.pollNow();
  assert.ok(mealie.requests.slice(again).some((request) => request.path === 'users/self'));
});
