// -----------------------------------------------------------------------------
// The scene actions, as a scene runs them (fields resolved by the core), on
// the in-memory Mealie: what changes in Mealie, what the outputs say, and the
// errors a scene log shows.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFeatureKey } from '../src/devices.js';
import {
  CONFIG,
  FakeMealie,
  LIST_IDS,
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

const run = (w, key, fields = {}) => w.fake.sceneAction(key, fields);
const unchecked = (mealie, listId) =>
  mealie.items.filter((item) => item.shoppingListId === listId && !item.checked);

test('"the milk is finished" twice adds one milk; a new item is added to the first list', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  await createDevice(w);

  const again = await run(w, 'add_shopping_item', { item: 'lait' });
  assert.deepEqual(again, {
    success: true,
    data: { outputs: { added: false, item: 'Lait', list: 'Courses', to_buy: 6 } },
  });
  assert.equal(mealie.writes().length, 0, 'nothing written');

  const added = await run(w, 'add_shopping_item', { item: '  Moutarde  de Dijon ' });
  assert.deepEqual(added.data.outputs, {
    added: true,
    item: 'Moutarde de Dijon',
    list: 'Courses',
    to_buy: 7,
  });
  assert.equal(unchecked(mealie, LIST_IDS.COURSES).at(-1).display, 'Moutarde de Dijon');
  // The counter of the device follows at once, without waiting for the timer.
  assert.equal(w.fake.lastState(ids(w.gladys).feature(listFeatureKey(LIST_IDS.COURSES))), 7);
});

test('a list is chosen by its name; an unknown one is an error naming the lists', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  const added = await run(w, 'add_shopping_item', { item: 'Vis', list: 'brico' });
  assert.equal(added.data.outputs.list, 'Bricolage');
  assert.equal(unchecked(mealie, LIST_IDS.BRICOLAGE).length, 1);

  const unknown = await run(w, 'add_shopping_item', { item: 'Vis', list: 'Pharmacie' });
  assert.equal(unknown.success, false);
  assert.equal(
    unknown.error,
    'No shopping list "Pharmacie" in Mealie (lists: Bricolage, Courses).',
  );
  const empty = await run(w, 'add_shopping_item', { item: '   ' });
  assert.equal(empty.error, 'Enter the item to add.');
});

test('errors are in the language of the configuration', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'de' } });
  const unknown = await run(w, 'add_shopping_item', { item: 'Vis', list: 'Apotheke' });
  assert.match(unknown.error, /^Keine Einkaufsliste „Apotheke“/);
});

test('checking an item: by its name, plural and accents aside; an absent one is no error', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  const checked = await run(w, 'check_shopping_item', { item: 'Tomates' });
  assert.deepEqual(checked.data.outputs, {
    checked: true,
    item: 'tomate',
    list: 'Courses',
    to_buy: 5,
  });
  const tomato = mealie.items.find((item) => item.food?.name === 'tomate');
  assert.equal(tomato.checked, true);
  assert.equal(tomato.note, 'bien mûres', 'the item kept its details');

  const eggs = await run(w, 'check_shopping_item', { item: 'oeufs' });
  assert.equal(eggs.data.outputs.item, 'Œufs');

  const absent = await run(w, 'check_shopping_item', { item: 'Caviar' });
  assert.deepEqual(absent.data.outputs, {
    checked: false,
    item: 'Caviar',
    list: 'Courses',
    to_buy: 4,
  });
  const flour = await run(w, 'check_shopping_item', { item: 'Farine' });
  assert.equal(flour.data.outputs.checked, false, 'already checked');
});

test('a recipe in the meal plan: found by part of its name, not added twice', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  await createDevice(w);
  const added = await run(w, 'add_to_meal_plan', {
    recipe: 'pancake',
    day: 'tomorrow',
    meal: 'breakfast',
  });
  assert.deepEqual(added.data.outputs, { added: true, recipe: 'Pancakes', date: '2026-10-15' });
  assert.equal(lastText(w, 'tomorrow_breakfast'), 'Pancakes', 'the feature follows at once');

  const twice = await run(w, 'add_to_meal_plan', {
    recipe: 'Pancakes',
    day: 'tomorrow',
    meal: 'breakfast',
  });
  assert.equal(twice.data.outputs.added, false);
  assert.equal(mealie.writes().length, 1);

  const none = await run(w, 'add_to_meal_plan', { recipe: 'Paella', day: 'today', meal: 'dinner' });
  assert.equal(none.error, 'No recipe matches "Paella" in Mealie.');
});

test('no recipe given: Mealie picks one; with no recipe at all, the error says so', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  const random = await run(w, 'add_to_meal_plan', { day: 'day_after_tomorrow', meal: 'lunch' });
  assert.equal(random.data.outputs.added, true);
  assert.equal(random.data.outputs.date, '2026-10-16');
  assert.equal(mealie.writes().at(-1).path, 'households/mealplans/random');
  mealie.recipes = [];
  const empty = await run(w, 'add_to_meal_plan', { day: 'today', meal: 'lunch' });
  assert.match(empty.error, /no recipe to pick/);
});

test('Mealie before 3.7 knows four meal types: the error says which', async (t) => {
  const mealie = Object.assign(new FakeMealie(), { before37: true });
  const w = await world(t, { mealie });
  const ack = await run(w, 'add_to_meal_plan', { recipe: 'pancakes', day: 'today', meal: 'snack' });
  assert.match(ack.error, /snack, drink and dessert need Mealie 3\.7/);
  const random = await run(w, 'add_to_meal_plan', { day: 'today', meal: 'dessert' });
  assert.match(random.error, /need Mealie 3\.7/);
  const side = await run(w, 'add_to_meal_plan', { recipe: 'pancakes', day: 'today', meal: 'side' });
  assert.equal(side.data.outputs.added, true);
});

test('the meals of a day, for a message', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'fr' } });
  const today = await run(w, 'get_meals', { day: 'today' });
  assert.deepEqual(today.data.outputs, {
    breakfast: 'Pancakes',
    lunch: 'Quiche lorraine',
    dinner: 'Bœuf bourguignon',
    summary:
      'Petit-déjeuner : Pancakes · Déjeuner : Quiche lorraine · Dîner : Bœuf bourguignon · Dessert : Yaourt',
    count: 4,
  });
  const later = await run(w, 'get_meals', { day: 'day_after_tomorrow' });
  assert.deepEqual(later.data.outputs, {
    breakfast: 'Rien de prévu',
    lunch: 'Rien de prévu',
    dinner: 'Quiche lorraine',
    summary: 'Dîner : Quiche lorraine',
    count: 1,
  });
});

test('a shopping list, for a message', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'fr' } });
  const list = await run(w, 'get_shopping_list', {});
  assert.deepEqual(list.data.outputs, {
    list: 'Courses',
    to_buy: 6,
    items: 'Lait, Pain, Œufs, Beurre (×2), Café, tomate (1,5 kg · bien mûres)',
  });
  const empty = await run(w, 'get_shopping_list', { list: 'Bricolage' });
  assert.deepEqual(empty.data.outputs, { list: 'Bricolage', to_buy: 0, items: '' });
});

test('a Mealie that does not answer fails the action with the reason', async (t) => {
  const mealie = new FakeMealie();
  const w = await world(t, { mealie });
  mealie.failure = 'down';
  w.clock.advance(60_000);
  const ack = await run(w, 'add_shopping_item', { item: 'Lait' });
  assert.equal(ack.success, false);
  assert.equal(ack.error, 'Mealie cannot be read: Mealie does not answer.');
  const notConfigured = await createWorld({ config: { language: 'en' } });
  t.after(() => notConfigured.app.stop());
  const refused = await notConfigured.fake.sceneAction('get_meals', { day: 'today' });
  assert.equal(refused.error, 'Mealie is not configured.');
});
