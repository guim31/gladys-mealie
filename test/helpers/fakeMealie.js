// -----------------------------------------------------------------------------
// An in-memory Mealie, seeded with the answers of a real Mealie 3.28
// (test/fixtures/mealie/real/, recorded on 2026-10-14), speaking the same
// REST API through the HTTP seam of the client (src/mealie/http.js). It keeps
// the quirks the integration must live with: the about page needs no token,
// a PUT of an item replaces the whole item, a note added with quantity 0 is
// displayed alone.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/mealie/real/${name}.json`, import.meta.url), 'utf8'),
  );

export const TOKEN = 'test-token-0123456789';
export const BASE_URL = 'http://192.0.2.10:9925';
export const LIST_IDS = Object.freeze({
  COURSES: '6cfb5367-0651-45f3-b105-5210238236eb',
  BRICOLAGE: '4c03d12a-4388-4fb6-b4ce-04954c360b2b',
});
export const HOUSEHOLD_ID = '1c3daafc-12d0-408e-a640-6f26b4e1fab4';

const json = (status, body) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const page = (items) => ({
  page: 1,
  per_page: items.length,
  total: items.length,
  total_pages: 1,
  items,
  next: null,
  previous: null,
});

export class FakeMealie {
  constructor({ token = TOKEN } = {}) {
    this.token = token;
    this.about = fixture('about');
    this.user = fixture('users-self');
    this.statisticsBody = fixture('statistics');
    this.mealplans = fixture('mealplans-week').items;
    this.lists = fixture('shopping-lists').items;
    this.items = fixture('shopping-items-unchecked').items;
    // A checked item: Mealie keeps them until "delete checked".
    this.items.push({
      ...this.items[0],
      id: '0be981e0-289d-489b-bdb8-487aba8aecb5',
      note: 'Farine',
      display: '1 Farine',
      checked: true,
    });
    const recipes = new Map();
    for (const entry of this.mealplans) {
      if (entry.recipe) {
        recipes.set(entry.recipe.id, entry.recipe);
      }
    }
    for (const recipe of fixture('recipes-search').items) {
      recipes.set(recipe.id, recipe);
    }
    this.recipes = [...recipes.values()];
    this.nextMealId = 100;
    /** 'down' (no answer), 'html' (another web page), 'v1' (no household), or null. */
    this.failure = null;
    /** Mealie before 3.7: no snack, drink, dessert meal types. */
    this.before37 = false;
    /** Every request received: { method, path, query, body }. */
    this.requests = [];
  }

  /** The HTTP seam of the client. */
  request = async (url, { method = 'GET', headers = {}, body } = {}) => {
    const target = new URL(url);
    if (!url.startsWith(`${BASE_URL}/`) || this.failure === 'down') {
      const error = new Error(`connect ECONNREFUSED ${target.host}`);
      error.code = 'ECONNREFUSED';
      throw error;
    }
    const path = target.pathname.replace(/^\/api\//, '');
    this.requests.push({
      method,
      path,
      query: Object.fromEntries(target.searchParams),
      body: body === undefined ? undefined : JSON.parse(body),
    });
    if (this.failure === 'html') {
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<html></html>' };
    }
    if (path === 'app/about' && method === 'GET') {
      return json(200, this.about);
    }
    if (headers.authorization !== `Bearer ${this.token}`) {
      return json(401, { detail: 'Could not validate credentials' });
    }
    return this.route(method, path, target.searchParams, body ? JSON.parse(body) : undefined);
  };

  route(method, path, query, body) {
    if (path === 'users/self' && method === 'GET') {
      if (this.failure === 'v1') {
        const { householdId: _id, household: _name, ...v1 } = this.user;
        return json(200, v1);
      }
      return json(200, this.user);
    }
    if (this.failure === 'v1' && path.startsWith('households/')) {
      return json(404, { detail: 'Not Found' });
    }
    if (path === 'households/statistics' && method === 'GET') {
      return json(200, { ...this.statisticsBody, totalRecipes: this.recipes.length });
    }
    if (path === 'households/mealplans' && method === 'GET') {
      const start = query.get('start_date') ?? '0000-00-00';
      const end = query.get('end_date') ?? '9999-99-99';
      return json(
        200,
        page(this.mealplans.filter((entry) => entry.date >= start && entry.date <= end)),
      );
    }
    const oldTypes = ['breakfast', 'lunch', 'dinner', 'side'];
    if (
      this.before37 &&
      path.startsWith('households/mealplans') &&
      method === 'POST' &&
      !oldTypes.includes(body.entryType)
    ) {
      return json(422, { detail: [{ type: 'enum', loc: ['body', 'entryType'] }] });
    }
    if (path === 'households/mealplans' && method === 'POST') {
      const recipe = this.recipes.find((r) => r.id === body.recipeId) ?? null;
      return json(201, this.addMeal(body.date, body.entryType, recipe));
    }
    if (path === 'households/mealplans/random' && method === 'POST') {
      if (this.recipes.length === 0) {
        return json(404, { detail: { message: 'No recipes match your rules' } });
      }
      return json(200, this.addMeal(body.date, body.entryType, this.recipes[0]));
    }
    if (path === 'households/shopping/lists' && method === 'GET') {
      return json(200, page(this.lists));
    }
    if (path === 'households/shopping/items' && method === 'GET') {
      const filter = query.get('queryFilter');
      const items =
        filter === 'checked=false' ? this.items.filter((item) => !item.checked) : this.items;
      return json(200, page(items));
    }
    if (path === 'households/shopping/items' && method === 'POST') {
      if (!this.lists.some((list) => list.id === body.shoppingListId)) {
        return json(404, { detail: 'list not found' });
      }
      const quantity = body.quantity ?? 1;
      const item = {
        quantity,
        unit: null,
        food: null,
        referencedRecipe: null,
        note: body.note ?? '',
        display: quantity ? `${quantity} ${body.note}` : body.note,
        shoppingListId: body.shoppingListId,
        checked: body.checked ?? false,
        position: 0,
        foodId: null,
        labelId: null,
        unitId: null,
        extras: {},
        id: randomUUID(),
        groupId: this.user.groupId,
        householdId: this.user.householdId,
        label: null,
        recipeReferences: [],
        createdAt: new Date(Date.UTC(2026, 9, 14, 20, this.items.length)).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 9, 14, 20, this.items.length)).toISOString(),
      };
      this.items.push(item);
      return json(201, { createdItems: [item], updatedItems: [], deletedItems: [] });
    }
    const itemMatch = path.match(/^households\/shopping\/items\/([^/]+)$/);
    if (itemMatch) {
      const index = this.items.findIndex((item) => item.id === decodeURIComponent(itemMatch[1]));
      if (index === -1) {
        return json(404, { detail: 'item not found' });
      }
      if (method === 'GET') {
        return json(200, this.items[index]);
      }
      if (method === 'PUT') {
        if (!body.shoppingListId) {
          return json(422, { detail: 'shoppingListId: Field required' });
        }
        // Mealie replaces the item: what the body leaves out is emptied.
        const replaced = {
          ...body,
          note: body.note ?? '',
          food: body.food ?? null,
          unit: body.unit ?? null,
        };
        this.items[index] = replaced;
        return json(200, { createdItems: [], updatedItems: [replaced], deletedItems: [] });
      }
    }
    if (path === 'recipes' && method === 'GET') {
      const search = (query.get('search') ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
      const found = this.recipes.filter((recipe) =>
        recipe.name
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .replace(/œ/gi, 'oe')
          .toLowerCase()
          .includes(search),
      );
      return json(200, page(found));
    }
    return json(404, { detail: 'Not Found' });
  }

  addMeal(date, entryType, recipe) {
    const entry = {
      date,
      entryType,
      title: '',
      text: '',
      recipeId: recipe?.id ?? null,
      recipeScale: 1,
      id: (this.nextMealId += 1),
      groupId: this.user.groupId,
      userId: this.user.id,
      householdId: this.user.householdId,
      recipe,
    };
    this.mealplans.push(entry);
    return entry;
  }

  /** An item of a list, as the Mealie app would add it. */
  addNote(listId, note, extra = {}) {
    return this.route('POST', 'households/shopping/items', null, {
      shoppingListId: listId,
      note,
      quantity: 0,
      ...extra,
    });
  }

  /** Requests of a path (writes by default). */
  writes() {
    return this.requests.filter((request) => request.method !== 'GET');
  }
}
