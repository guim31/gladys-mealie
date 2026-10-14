// -----------------------------------------------------------------------------
// The pure functions over the Mealie answers, on the real answers of Mealie
// 3.28 and the fixtures of the Home Assistant tests (Mealie servers of 2024).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addDays,
  dayKey,
  entryTitle,
  findList,
  groupMeals,
  itemDetail,
  itemLabel,
  itemMatches,
  itemName,
  msUntilNextDay,
  normalizeName,
  pickRecipe,
  sortItems,
} from '../src/mealie/model.js';

const load = (path) =>
  JSON.parse(readFileSync(new URL(`./fixtures/mealie/${path}.json`, import.meta.url), 'utf8'));
const realMeals = load('real/mealplans-week').items;
const realItems = load('real/shopping-items-unchecked').items;
const realLists = load('real/shopping-lists').items;
const haMeals = load('home-assistant/get_mealplans').items;
const haItems = load('home-assistant/get_shopping_items').items;
const haLists = load('home-assistant/get_shopping_lists').items;

test('days follow the time zone of Gladys, across midnight and daylight saving', () => {
  // 23:30 UTC on 14 October is already the 15th in Paris, still the 14th in New York.
  const late = Date.UTC(2026, 9, 14, 23, 30);
  assert.equal(dayKey(late, 'Europe/Paris'), '2026-10-15');
  assert.equal(dayKey(late, 'America/New_York'), '2026-10-14');
  assert.equal(addDays('2026-10-14', 6), '2026-10-20');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  // 10:00 in Paris: 14 hours to midnight.
  assert.equal(msUntilNextDay(Date.UTC(2026, 9, 14, 8, 0), 'Europe/Paris'), 14 * 3600_000);
  // The night of the change to winter time (25 October 2026) lasts 25 hours.
  assert.equal(msUntilNextDay(Date.UTC(2026, 9, 24, 22, 0), 'Europe/Paris'), 25 * 3600_000);
  // A minute at least, even a second before midnight.
  assert.equal(msUntilNextDay(Date.UTC(2026, 9, 14, 21, 59, 59), 'Europe/Paris'), 60_000);
});

test('meal plan entries are grouped by day, in the order of a day; notes count too', () => {
  const days = groupMeals(realMeals);
  assert.deepEqual([...days.keys()], ['2026-10-14', '2026-10-15', '2026-10-16']);
  assert.deepEqual(Object.fromEntries(days.get('2026-10-14')), {
    breakfast: ['Pancakes'],
    lunch: ['Quiche lorraine'],
    dinner: ['Bœuf bourguignon'],
    dessert: ['Yaourt'],
  });
  assert.deepEqual([...days.get('2026-10-14').keys()], ['breakfast', 'lunch', 'dinner', 'dessert']);
  assert.deepEqual(Object.fromEntries(days.get('2026-10-15')), {
    lunch: ['Restes'],
    dinner: ['Salade niçoise'],
  });
});

test('the Home Assistant fixtures: two dinners on one day, and every entry has a title', () => {
  const days = groupMeals(haMeals);
  const titles = [...days.values()].flatMap((meals) => [...meals.values()].flat());
  assert.equal(titles.length, haMeals.filter((entry) => entryTitle(entry)).length);
  assert.ok(titles.length >= 10);
  assert.ok([...days.values()].some((meals) => [...meals.values()].some((t) => t.length > 1)));
  assert.equal(entryTitle({ title: '', text: '  Pizza\n night ' }), 'Pizza night');
  assert.equal(entryTitle({ recipe: null, title: '', text: '' }), null);
});

test('items are named as in the Mealie app, with their details apart', () => {
  const [milk, bread, eggs, butter, coffee, tomato] = sortItems(realItems);
  assert.deepEqual([milk, bread, eggs, butter, coffee, tomato].map(itemName), [
    'Lait',
    'Pain',
    'Œufs',
    'Beurre',
    'Café',
    'tomate',
  ]);
  assert.equal(itemDetail(milk, 'fr'), '', 'a bare note counts one, nothing to show');
  assert.equal(itemDetail(butter, 'fr'), '×2');
  assert.equal(itemDetail(coffee, 'fr'), '');
  assert.equal(itemDetail(tomato, 'fr'), '1,5 kg · bien mûres');
  assert.equal(itemDetail(tomato, 'en'), '1.5 kg · bien mûres');
  assert.equal(itemLabel(tomato, 'fr'), 'tomate (1,5 kg · bien mûres)');
  for (const item of haItems) {
    assert.ok(itemName(item) && itemName(item) !== '?', JSON.stringify(item.display));
  }
});

test('an item is found the way a person names it', () => {
  const [milk, , eggs, , , tomato] = sortItems(realItems);
  assert.ok(itemMatches(milk, 'lait'));
  assert.ok(itemMatches(milk, '  LAIT '));
  assert.ok(itemMatches(eggs, 'oeufs'));
  assert.ok(itemMatches(eggs, 'oeuf'), 'singular');
  assert.ok(itemMatches(tomato, 'Tomates'), 'plural');
  assert.ok(!itemMatches(milk, 'lait de coco'));
  assert.ok(!itemMatches(milk, ''));
  assert.equal(normalizeName('Crème  Fraîche'), 'creme fraiche');
  assert.equal(normalizeName('Straße'), 'strasse');
});

test('a list is found by its name, or the first created one when no name is given', () => {
  assert.equal(findList(realLists, '').name, 'Courses', 'Courses was created first');
  assert.equal(findList(realLists, 'bricolage').name, 'Bricolage');
  assert.equal(findList(realLists, 'cour').name, 'Courses', 'the beginning of a name');
  assert.equal(findList(realLists, 'nope'), null);
  assert.equal(findList([], ''), null);
  assert.ok(findList(haLists, 'supermarket'));
});

test('a recipe: the same name first, else the first search result', () => {
  const recipes = [{ name: 'Quiche aux poireaux' }, { name: 'Quiche lorraine' }];
  assert.equal(pickRecipe(recipes, 'quiche LORRAINE').name, 'Quiche lorraine');
  assert.equal(pickRecipe(recipes, 'quiche').name, 'Quiche aux poireaux');
  assert.equal(pickRecipe([], 'quiche'), null);
});
