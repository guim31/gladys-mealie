// -----------------------------------------------------------------------------
// Mealie client: the REST API of Mealie 2.x and later (`/api/households/...`,
// the household endpoints that replaced the group ones of Mealie 1.x), the
// one Home Assistant uses through aiomealie.
//
// Authentication: `Authorization: Bearer <API token>`, a long-lived token a
// user creates in Mealie (Profile → API Tokens). It gives the rights of that
// user, on the meal plan and the shopping lists of that user's household.
//
// What the integration writes stays small and reversible: a shopping list
// item added, checked or unchecked, a recipe added to the meal plan. Nothing
// is ever deleted.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // API token refused (wrong, expired, deleted)
  TOKEN_MISSING: 'token_missing', // no API token in the configuration
  FORBIDDEN: 'forbidden', // the token's user may not do this
  NOT_MEALIE: 'not_mealie', // something answers, not a Mealie
  TOO_OLD: 'too_old', // Mealie 1.x: no household API
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  HTTP: 'http', // any other HTTP error
});

export class MealieError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'MealieError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// The meal types of the Mealie meal plan (PlanEntryType), in the order of a day.
export const ENTRY_TYPES = Object.freeze([
  'breakfast',
  'lunch',
  'dinner',
  'side',
  'snack',
  'drink',
  'dessert',
]);

export class MealieClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {string} [options.token] API token, '' for none
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, token = '', insecure = false, request = httpRequest, timeoutMs = 10_000 }) {
    this.url = url;
    this.token = token;
    this.insecure = insecure;
    this.request = request;
    this.timeoutMs = timeoutMs;
  }

  /**
   * One API call.
   * @param {string} method
   * @param {string} path below `/api/`, query string included
   * @param {object} [body] sent as JSON
   * @param {object} [options] { auth: false for the public endpoints }
   * @returns {Promise<any>} the parsed JSON answer
   * @throws {MealieError}
   */
  async call(method, path, body, { auth = true } = {}) {
    const headers = { accept: 'application/json' };
    if (auth) {
      if (!this.token) {
        throw new MealieError(ERROR_KINDS.TOKEN_MISSING, 'No API token configured');
      }
      headers.authorization = `Bearer ${this.token}`;
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    let response;
    try {
      response = await this.request(`${this.url}/api/${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        insecure: this.insecure,
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new MealieError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      throw new MealieError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
    }

    const { status } = response;
    const where = `${method} /api/${path.split('?')[0]}`;
    if (status === 401) {
      throw new MealieError(ERROR_KINDS.AUTH, `API token refused (HTTP 401, ${where})`, {
        status,
      });
    }
    if (status === 403) {
      throw new MealieError(ERROR_KINDS.FORBIDDEN, `Not allowed (HTTP 403, ${where})`, { status });
    }
    if (status >= 300 && status < 400) {
      throw new MealieError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status}, ${where})`, {
        status,
      });
    }
    if (status < 200 || status >= 300) {
      throw new MealieError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status}, ${where})`, {
        status,
      });
    }
    try {
      return JSON.parse(response.body);
    } catch {
      // An HTML page in 200: another service, or a proxy login page.
      throw new MealieError(ERROR_KINDS.NOT_MEALIE, `The answer is not JSON (${where})`);
    }
  }

  // --- Identity ------------------------------------------------------------------

  /**
   * Who the token is, and in which household: checks the address, the token
   * and the Mealie version in one go.
   * @returns {Promise<{ version: string|null, user: object }>}
   */
  async identify() {
    let about;
    try {
      about = await this.call('GET', 'app/about', undefined, { auth: false });
    } catch (err) {
      if (err.kind === ERROR_KINDS.HTTP && err.status === 404) {
        throw new MealieError(ERROR_KINDS.NOT_MEALIE, 'No Mealie API at this address (HTTP 404)');
      }
      throw err;
    }
    if (!about || typeof about !== 'object' || !('version' in about)) {
      throw new MealieError(ERROR_KINDS.NOT_MEALIE, 'The answer is not the Mealie about page');
    }
    const version = typeof about.version === 'string' ? about.version : null;
    const user = await this.call('GET', 'users/self');
    if (!user || typeof user !== 'object' || typeof user.id !== 'string') {
      throw new MealieError(ERROR_KINDS.NOT_MEALIE, 'The answer is not a Mealie user');
    }
    // Mealie 1.x: groups but no households, and none of the endpoints below.
    if (typeof user.householdId !== 'string' || !user.householdId) {
      throw new MealieError(ERROR_KINDS.TOO_OLD, `Mealie ${version ?? '?'} has no household API`);
    }
    return { version, user };
  }

  // --- Reading -------------------------------------------------------------------

  /** Counts of the household: totalRecipes, totalUsers, totalCategories... */
  statistics() {
    return this.call('GET', 'households/statistics');
  }

  /**
   * The meal plan entries between two dates, both included.
   * @param {string} start `YYYY-MM-DD`
   * @param {string} end `YYYY-MM-DD`
   */
  async mealPlans(start, end) {
    const query = new URLSearchParams({ start_date: start, end_date: end, perPage: '-1' });
    return itemsOf(await this.call('GET', `households/mealplans?${query}`));
  }

  /** Every shopping list of the household. */
  async shoppingLists() {
    const query = new URLSearchParams({ perPage: '-1', orderBy: 'name', orderDirection: 'asc' });
    return itemsOf(await this.call('GET', `households/shopping/lists?${query}`));
  }

  /** The items still to buy, every list at once (one request, whatever the number of lists). */
  async uncheckedItems() {
    const query = new URLSearchParams({
      perPage: '-1',
      queryFilter: 'checked=false',
      orderBy: 'position',
      orderDirection: 'asc',
    });
    return itemsOf(await this.call('GET', `households/shopping/items?${query}`));
  }

  /** Recipes whose name (or description, tags...) matches, as Mealie's search box does. */
  async searchRecipes(search, perPage = 20) {
    const query = new URLSearchParams({ search, perPage: String(perPage) });
    return itemsOf(await this.call('GET', `recipes?${query}`));
  }

  // --- Writing (small and reversible) ------------------------------------------------

  /**
   * Add an item to a list: a free note, like "milk" typed in the Mealie app.
   * Quantity 0: Mealie then shows the note alone ("Milk", not "1 Milk").
   */
  async addItem(listId, note) {
    const answer = await this.call('POST', 'households/shopping/items', {
      shoppingListId: listId,
      note,
      quantity: 0,
      checked: false,
    });
    return answer?.createdItems?.[0] ?? null;
  }

  /**
   * Check or uncheck an item. The PUT of Mealie replaces the whole item (a
   * partial body empties the note, the food, the unit): the item is read
   * first and sent back whole.
   */
  async setItemChecked(itemId, checked) {
    const path = `households/shopping/items/${encodeURIComponent(itemId)}`;
    const item = await this.call('GET', path);
    const answer = await this.call('PUT', path, { ...item, checked });
    return answer?.updatedItems?.find((updated) => updated.id === itemId) ?? { ...item, checked };
  }

  /** Put a recipe in the meal plan. */
  addMealPlanEntry(date, entryType, recipeId) {
    return this.call('POST', 'households/mealplans', { date, entryType, recipeId });
  }

  /** Let Mealie pick a recipe (its meal plan rules apply). */
  addRandomMealPlanEntry(date, entryType) {
    return this.call('POST', 'households/mealplans/random', { date, entryType });
  }
}

/** The `items` of a paginated answer. */
function itemsOf(answer) {
  return Array.isArray(answer?.items) ? answer.items : [];
}
