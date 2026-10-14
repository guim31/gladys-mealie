// -----------------------------------------------------------------------------
// The Mealie client against the in-memory Mealie (real answers of Mealie
// 3.28): what it reads, what it writes, and how each failure is named.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_KINDS, MealieClient } from '../src/mealie/client.js';
import { BASE_URL, FakeMealie, HOUSEHOLD_ID, LIST_IDS, TOKEN } from './helpers/fakeMealie.js';

function client(mealie = new FakeMealie(), options = {}) {
  return new MealieClient({ url: BASE_URL, token: TOKEN, request: mealie.request, ...options });
}

/** The kind of the MealieError a promise rejects with. */
async function kindOf(promise) {
  try {
    await promise;
  } catch (err) {
    assert.equal(err.name, 'MealieError', err.stack);
    return err.kind;
  }
  assert.fail('expected a MealieError');
}

test('identify: the version and the household of the token', async () => {
  const mealie = new FakeMealie();
  const { version, user } = await client(mealie).identify();
  assert.equal(version, 'develop');
  assert.equal(user.householdId, HOUSEHOLD_ID);
  assert.equal(user.household, 'Family');
  assert.deepEqual(
    mealie.requests.map((r) => r.path),
    ['app/about', 'users/self'],
  );
});

test('reads the meal plan of a date range, the lists and the items still to buy', async () => {
  const mealie = new FakeMealie();
  const c = client(mealie);
  const meals = await c.mealPlans('2026-10-15', '2026-10-15');
  assert.deepEqual(meals.map((m) => m.entryType).sort(), ['dinner', 'lunch']);
  assert.deepEqual(mealie.requests.at(-1).query, {
    start_date: '2026-10-15',
    end_date: '2026-10-15',
    perPage: '-1',
  });
  const lists = await c.shoppingLists();
  assert.deepEqual(
    lists.map((l) => l.name),
    ['Bricolage', 'Courses'],
  );
  const items = await c.uncheckedItems();
  assert.equal(items.length, 6);
  assert.ok(items.every((item) => item.checked === false));
  assert.equal(mealie.requests.at(-1).query.queryFilter, 'checked=false');
  assert.equal((await c.statistics()).totalRecipes, 4);
  assert.deepEqual(
    (await c.searchRecipes('bourguignon')).map((r) => r.name),
    ['Bœuf bourguignon'],
  );
});

test('an item is added as a note with quantity 0, as the Mealie app shows "Lait", not "1 Lait"', async () => {
  const mealie = new FakeMealie();
  const created = await client(mealie).addItem(LIST_IDS.COURSES, 'Moutarde');
  assert.deepEqual(mealie.writes().at(-1).body, {
    shoppingListId: LIST_IDS.COURSES,
    note: 'Moutarde',
    quantity: 0,
    checked: false,
  });
  assert.equal(created.display, 'Moutarde');
});

test('checking an item sends it back whole: a partial PUT would empty its note and food', async () => {
  const mealie = new FakeMealie();
  const tomato = mealie.items.find((item) => item.food?.name === 'tomate');
  const updated = await client(mealie).setItemChecked(tomato.id, true);
  assert.equal(updated.checked, true);
  const stored = mealie.items.find((item) => item.id === tomato.id);
  assert.equal(stored.note, 'bien mûres');
  assert.equal(stored.food.name, 'tomate');
  assert.equal(stored.unit.abbreviation, 'kg');
  const put = mealie.writes().at(-1);
  assert.equal(put.method, 'PUT');
  assert.equal(put.body.shoppingListId, LIST_IDS.COURSES);
  assert.equal(put.body.quantity, 1.5);
});

test('meal plan entries: a chosen recipe, or a random one', async () => {
  const mealie = new FakeMealie();
  const c = client(mealie);
  const recipe = mealie.recipes.find((r) => r.slug === 'pancakes');
  const entry = await c.addMealPlanEntry('2026-10-18', 'breakfast', recipe.id);
  assert.equal(entry.recipe.name, 'Pancakes');
  assert.deepEqual(mealie.writes().at(-1).body, {
    date: '2026-10-18',
    entryType: 'breakfast',
    recipeId: recipe.id,
  });
  const random = await c.addRandomMealPlanEntry('2026-10-18', 'dinner');
  assert.equal(mealie.writes().at(-1).path, 'households/mealplans/random');
  assert.ok(random.recipe.name);
});

test('each failure has its kind, and its message carries no secret', async () => {
  const cases = [
    ['a wrong token', client(new FakeMealie({ token: 'other' })), ERROR_KINDS.AUTH],
    ['no token', client(new FakeMealie(), { token: '' }), ERROR_KINDS.TOKEN_MISSING],
    [
      'nothing at the address',
      client(Object.assign(new FakeMealie(), { failure: 'down' })),
      ERROR_KINDS.UNREACHABLE,
    ],
    [
      'another web page',
      client(Object.assign(new FakeMealie(), { failure: 'html' })),
      ERROR_KINDS.NOT_MEALIE,
    ],
    ['Mealie 1.x', client(Object.assign(new FakeMealie(), { failure: 'v1' })), ERROR_KINDS.TOO_OLD],
  ];
  for (const [label, c, kind] of cases) {
    assert.equal(await kindOf(c.identify()), kind, label);
  }
  const answer =
    (status, body = '{}') =>
    async () => ({ status, headers: {}, body });
  const raw = (request) => new MealieClient({ url: BASE_URL, token: TOKEN, request });
  assert.equal(await kindOf(raw(answer(404)).identify()), ERROR_KINDS.NOT_MEALIE, '404 on about');
  assert.equal(await kindOf(raw(answer(200, '{"a":1}')).identify()), ERROR_KINDS.NOT_MEALIE);
  assert.equal(await kindOf(raw(answer(302)).statistics()), ERROR_KINDS.REDIRECT);
  assert.equal(await kindOf(raw(answer(403)).statistics()), ERROR_KINDS.FORBIDDEN);
  assert.equal(await kindOf(raw(answer(500)).statistics()), ERROR_KINDS.HTTP);
  const tls = async () => {
    throw Object.assign(new Error('self-signed certificate'), {
      code: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    });
  };
  assert.equal(await kindOf(raw(tls).statistics()), ERROR_KINDS.TLS);
  try {
    await client(new FakeMealie({ token: 'other' })).identify();
  } catch (err) {
    assert.ok(!err.message.includes(TOKEN), 'never the token');
  }
});

test('the self-signed option reaches the transport, the token only the header', async () => {
  const seen = [];
  const c = new MealieClient({
    url: 'https://192.0.2.10',
    token: TOKEN,
    insecure: true,
    request: async (url, options) => {
      seen.push({ url, ...options });
      return { status: 200, headers: {}, body: '{"items":[]}' };
    },
  });
  await c.shoppingLists();
  assert.equal(seen[0].insecure, true);
  assert.equal(seen[0].headers.authorization, `Bearer ${TOKEN}`);
  assert.ok(!seen[0].url.includes(TOKEN));
});
