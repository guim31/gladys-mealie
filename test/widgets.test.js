// -----------------------------------------------------------------------------
// The two dashboard widgets: every content they can produce passes the
// validator of the SDK (vocabulary, budget, form fields) untouched, in the
// four languages; the buttons and their forms act on Mealie.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from '../src/hub.js';
import { ACTIONS, MAX_ROWS } from '../src/widgets.js';
import { CONFIG, FakeMealie, LIST_IDS, createWorld } from './helpers/world.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];

async function world(t, options = {}) {
  const result = await createWorld(options);
  t.after(() => result.app.stop());
  return result;
}

async function content(w, key, settings = {}, language = 'en') {
  const ack = await w.fake.widgetGet(key, { settings, language });
  assert.equal(ack.success, true, ack.error);
  const { content: body } = ack.data;
  assert.deepEqual(validateWidgetContent(body), [], JSON.stringify(body, null, 1));
  return body;
}

const ofType = (body, type) => body.components.filter((c) => c.type === type);
const button = (body, key) => ofType(body, 'button').find((b) => b.action?.key === key);

test('today: the date, one row per meal, Plan and Refresh', async (t) => {
  const w = await world(t);
  const body = await content(w, WIDGET_KEYS.MEAL_PLAN, { period: 'today' }, 'fr');
  assert.deepEqual(ofType(body, 'text'), [
    { type: 'text', variant: 'caption', text: 'Mercredi 14 octobre' },
  ]);
  assert.deepEqual(
    ofType(body, 'status')[0].items.map((row) => [row.label, row.value]),
    [
      ['Petit-déjeuner', 'Pancakes'],
      ['Déjeuner', 'Quiche lorraine'],
      ['Dîner', 'Bœuf bourguignon'],
      ['Dessert', 'Yaourt'],
    ],
  );
  assert.deepEqual(
    ofType(body, 'button').map((b) => b.label),
    ['Planifier', 'Actualiser'],
  );
  const form = button(body, ACTIONS.PLAN).action.fields;
  assert.deepEqual(
    form.map((field) => [field.key, field.type, field.default]),
    [
      ['recipe', 'string', undefined],
      ['day', 'select', 'today'],
      ['meal', 'select', 'dinner'],
    ],
  );
});

test('week: seven days, today and tomorrow marked, a detail per day', async (t) => {
  const w = await world(t);
  const body = await content(w, WIDGET_KEYS.MEAL_PLAN, { period: 'week' }, 'en');
  const [list] = ofType(body, 'card-list');
  assert.equal(list.items.length, 7);
  assert.deepEqual(list.items[0], {
    title: 'Wed, Oct 14',
    subtitle: 'Pancakes · Quiche lorraine · Bœuf bourguignon · Yaourt',
    description:
      'Breakfast: Pancakes\nLunch: Quiche lorraine\nDinner: Bœuf bourguignon\nDessert: Yaourt',
    badge: { text: 'Today', color: 'primary' },
  });
  assert.equal(list.items[1].badge.text, 'Tomorrow');
  assert.deepEqual(list.items[3], { title: 'Sat, Oct 17', subtitle: 'Nothing planned' });
});

test('an empty day says so; every period and language passes the validator', async (t) => {
  const mealie = new FakeMealie();
  mealie.mealplans = [];
  const w = await world(t, { mealie });
  const body = await content(w, WIDGET_KEYS.MEAL_PLAN, { period: 'today' }, 'en');
  assert.equal(ofType(body, 'text')[1].text, 'Nothing planned today in Mealie.');
  assert.equal(ofType(body, 'status').length, 0);
  const full = await world(t);
  for (const language of LANGUAGES) {
    for (const period of ['today', 'week']) {
      await content(full, WIDGET_KEYS.MEAL_PLAN, { period }, language);
    }
    await content(full, WIDGET_KEYS.SHOPPING_LIST, {}, language);
  }
});

test('the shopping list: what is left to buy, Add, Check and Refresh', async (t) => {
  const w = await world(t);
  const body = await content(w, WIDGET_KEYS.SHOPPING_LIST, {}, 'fr');
  assert.deepEqual(ofType(body, 'text'), [
    { type: 'text', variant: 'caption', text: 'Courses · 6 à acheter' },
  ]);
  assert.deepEqual(ofType(body, 'card-list')[0].items, [
    { title: 'Lait' },
    { title: 'Pain' },
    { title: 'Œufs' },
    { title: 'Beurre', subtitle: '×2' },
    { title: 'Café' },
    { title: 'tomate', subtitle: '1,5 kg · bien mûres' },
  ]);
  assert.deepEqual(
    ofType(body, 'button').map((b) => b.label),
    ['Ajouter', 'Cocher', 'Actualiser'],
  );
  const check = button(body, ACTIONS.CHECK).action.fields[0];
  assert.equal(check.type, 'select');
  assert.equal(check.options.length, 6);
  assert.deepEqual(check.options.at(-1).label, { en: 'tomate (1,5 kg · bien mûres)' });
});

test('a long list shows seven items and "+N more" with the rest in its detail', async (t) => {
  const mealie = new FakeMealie();
  for (const note of ['Sel', 'Poivre', 'Riz', 'Pâtes']) {
    mealie.addNote(LIST_IDS.COURSES, note);
  }
  const w = await world(t, { mealie });
  const body = await content(w, WIDGET_KEYS.SHOPPING_LIST, {}, 'en');
  const { items } = ofType(body, 'card-list')[0];
  assert.equal(items.length, MAX_ROWS);
  assert.deepEqual(items.at(-1), { title: '+3 more', description: 'Poivre\nRiz\nPâtes' });
});

test('an empty list, an unknown list, an unconfigured integration', async (t) => {
  const w = await world(t);
  const empty = await content(w, WIDGET_KEYS.SHOPPING_LIST, { list: 'Bricolage' }, 'en');
  assert.equal(ofType(empty, 'text')[1].text, 'Nothing to buy on Bricolage.');
  assert.equal(button(empty, ACTIONS.CHECK), undefined, 'nothing to check');
  const unknown = await content(w, WIDGET_KEYS.SHOPPING_LIST, { list: 'Garage' }, 'en');
  assert.match(ofType(unknown, 'text')[0].text, /No shopping list "Garage"/);
  const bare = await world(t, { config: { language: 'en' } });
  const message = await content(bare, WIDGET_KEYS.SHOPPING_LIST, {}, 'en');
  assert.match(message.components[0].text, /Enter the address of your Mealie/);
});

test('Mealie down: the last data stay, with the reason and the hour of the last reading', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  mealie.failure = 'down';
  w.clock.advance(60_000);
  const body = await content(w, WIDGET_KEYS.SHOPPING_LIST, {}, 'fr');
  assert.equal(
    ofType(body, 'text')[1].text,
    'Mealie ne répond pas : dernières données lues à 10:00.',
  );
  assert.equal(ofType(body, 'card-list')[0].items.length, 6);
  assert.equal(body.ttl_seconds, 60);
  const meals = await content(w, WIDGET_KEYS.MEAL_PLAN, { period: 'week' }, 'fr');
  assert.equal(ofType(meals, 'text').length, 2);
});

test('never read: the reason and a Refresh button', async (t) => {
  const mealie = Object.assign(new FakeMealie(), { failure: 'down' });
  const w = await world(t, { mealie });
  const body = await content(w, WIDGET_KEYS.MEAL_PLAN, {}, 'en');
  assert.equal(body.components[0].text, 'Mealie does not answer');
  assert.equal(body.components[1].action.key, ACTIONS.REFRESH);
});

test('an https Mealie gets an "Open Mealie" link to the page of the widget', async (t) => {
  const mealie = new FakeMealie();
  const https = 'https://192.0.2.10:9925';
  const request = (url, options) =>
    mealie.request(url.replace(https, 'http://192.0.2.10:9925'), options);
  const w = await createWorld({
    mealie: { ...mealie, request },
    config: { ...CONFIG, url: https },
  });
  t.after(() => w.app.stop());
  const list = await content(w, WIDGET_KEYS.SHOPPING_LIST, {}, 'en');
  const link = ofType(list, 'button').find((b) => b.link);
  assert.equal(link.link.url, `${https}/shopping-lists/${LIST_IDS.COURSES}`);
  assert.equal(ofType(list, 'button').length, 4, 'the four buttons of the budget');
  const plan = await content(w, WIDGET_KEYS.MEAL_PLAN, {}, 'en');
  assert.equal(
    ofType(plan, 'button').find((b) => b.link).link.url,
    `${https}/household/mealplan/planner/view`,
  );
});

test('the Add form adds the typed item; Check checks the chosen one', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  const added = await w.fake.widgetAction(
    WIDGET_KEYS.SHOPPING_LIST,
    ACTIONS.ADD,
    {},
    {
      settings: { list: 'Bricolage' },
      values: { item: 'Ampoules' },
    },
  );
  assert.equal(added.success, true);
  assert.equal(added.data.message.fr, '« Ampoules » ajouté à Bricolage.');
  assert.ok(
    mealie.items.some(
      (item) => item.note === 'Ampoules' && item.shoppingListId === LIST_IDS.BRICOLAGE,
    ),
  );

  const already = await w.fake.widgetAction(
    WIDGET_KEYS.SHOPPING_LIST,
    ACTIONS.ADD,
    {},
    {
      settings: {},
      values: { item: 'pain' },
    },
  );
  assert.equal(already.data.message.en, '"Pain" is already on Courses.');

  const bread = mealie.items.find((item) => item.note === 'Pain');
  const checked = await w.fake.widgetAction(
    WIDGET_KEYS.SHOPPING_LIST,
    ACTIONS.CHECK,
    {},
    {
      settings: {},
      values: { item: bread.id },
    },
  );
  assert.equal(checked.data.message.de, '„Pain“ auf Courses abgehakt.');
  assert.equal(bread.checked, false, 'the fake replaced the item');
  assert.equal(mealie.items.find((item) => item.id === bread.id).checked, true);
  const twice = await w.fake.widgetAction(
    WIDGET_KEYS.SHOPPING_LIST,
    ACTIONS.CHECK,
    {},
    {
      settings: {},
      values: { item: bread.id },
    },
  );
  assert.equal(twice.data.message.en, 'This item is no longer to buy on Courses.');
});

test('the Plan form puts a recipe in the meal plan', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  const ack = await w.fake.widgetAction(
    WIDGET_KEYS.MEAL_PLAN,
    ACTIONS.PLAN,
    {},
    {
      settings: {},
      values: { recipe: 'nicoise', day: 'day_after_tomorrow', meal: 'lunch' },
    },
  );
  assert.equal(ack.data.message.es, 'Salade niçoise previsto: pasado mañana, comida.');
  assert.equal(mealie.mealplans.at(-1).date, '2026-10-16');
  const none = await w.fake.widgetAction(
    WIDGET_KEYS.MEAL_PLAN,
    ACTIONS.PLAN,
    {},
    {
      settings: {},
      values: { recipe: 'Paella', day: 'today', meal: 'dinner' },
    },
  );
  assert.equal(none.success, true, 'a refusal is a toast, not a failure');
  assert.equal(none.data.message.fr, 'Aucune recette ne correspond à « Paella » dans Mealie.');
});

test('Refresh reads Mealie; a form button on a core without forms explains', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  const before = mealie.requests.length;
  const refresh = await w.fake.widgetAction(
    WIDGET_KEYS.SHOPPING_LIST,
    ACTIONS.REFRESH,
    {},
    {
      settings: {},
    },
  );
  assert.equal(refresh.data.message.en, 'Mealie read again.');
  assert.ok(mealie.requests.length > before);
  const old = await w.fake.widgetAction(
    WIDGET_KEYS.SHOPPING_LIST,
    ACTIONS.ADD,
    {},
    {
      settings: {},
    },
  );
  assert.equal(old.data.message.en, 'This button needs Gladys 5.2 or later.');
  const unknown = await w.fake.widgetAction(WIDGET_KEYS.MEAL_PLAN, 'nope', {}, { settings: {} });
  assert.equal(unknown.success, false);
});

test('every toast fits the 200 characters of the core', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  const long = 'Very long item name '.repeat(9).trim();
  const ack = await w.fake.widgetAction(
    WIDGET_KEYS.SHOPPING_LIST,
    ACTIONS.ADD,
    {},
    {
      settings: {},
      values: { item: long },
    },
  );
  for (const text of Object.values(ack.data.message)) {
    assert.ok(text.length <= 200, `${text.length} characters`);
  }
});
