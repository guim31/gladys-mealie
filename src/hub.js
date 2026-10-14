// -----------------------------------------------------------------------------
// The Mealie hub: reads Mealie on a timer of the container (the interval
// chosen in the configuration, and right after midnight so "today" follows
// the calendar), publishes the device and its states to Gladys, and runs the
// operations of the scene actions and the widget buttons.
//
// Gladys never polls the device (should_poll: false): the core scheduler does
// not reliably poll external devices (GladysAssistant/Gladys#3198, still open
// in 5.2.1), and its fixed list of frequencies stops at one minute. onPoll is
// kept as a fallback and reads Mealie at once.
//
// One reading = four requests at most: the meal plan of the next seven days,
// the shopping lists, the items still to buy of every list (one request, a
// query filter), the household statistics; plus "who am I" (the about page
// and the token's user) at start, after an error, and every hour.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { buildDevice, featureStates, householdIds } from './devices.js';
import { ENTRY_TYPES, ERROR_KINDS, MealieClient, MealieError } from './mealie/client.js';
import {
  addDays,
  dayKey,
  findList,
  groupMeals,
  itemMatches,
  itemName,
  msUntilNextDay,
  normalizeName,
  pickRecipe,
  sortItems,
} from './mealie/model.js';
import { hostOf } from './config.js';
import { ProblemLog } from './problems.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  DAY_TEXT,
  ERROR_TEXT,
  MEAL_TEXT,
  NOTHING_PLANNED,
  REPORT_TEXT,
  format,
  pick,
  say,
} from './texts.js';

const logger = createLogger({ name: 'mealie-hub' });

// Widget keys (manifest `widgets`): permanent once published.
export const WIDGET_KEYS = Object.freeze({
  MEAL_PLAN: 'meal_plan',
  SHOPPING_LIST: 'shopping_list',
});

// The days a scene or a form can pick, as offsets from today.
export const DAYS = Object.freeze({ today: 0, tomorrow: 1, day_after_tomorrow: 2 });

// Meal types added in Mealie 3.7: an older Mealie refuses them (422).
const RECENT_ENTRY_TYPES = ['snack', 'drink', 'dessert'];

// Days of meal plan read at each cycle: the week the widget shows.
export const WEEK_DAYS = 7;

export const HUB_TIMINGS = {
  // A failed reading is tried again this soon (then at the usual interval).
  retryMs: 60_000,
  // "Who am I" (version, household) is read again this often.
  identifyEveryMs: 3600_000,
  // A scene action or a widget reads Mealie again when the last read is older.
  freshMs: 30_000,
  // An unchanged state is sent again this often: Gladys shows "no recent
  // value" on a state older than 48 h.
  heartbeatMs: 6 * 3600_000,
  // Read a little after midnight, so "today" has changed for sure.
  midnightDelayMs: 5_000,
};

// A name in a message: a toast holds 200 characters.
const short = (text) => (text.length > 60 ? `${text.slice(0, 59).trimEnd()}…` : text);

const signature = (config) => JSON.stringify([config.url, config.token, config.allowSelfSigned]);

/** A refusal of an operation, said in the user's words. */
export class ActionError extends Error {
  /**
   * @param {object} entry a table entry of src/texts.js
   * @param {object} [values] its `{name}` values
   */
  constructor(entry, values = {}) {
    super(format(entry.en, typeof values === 'function' ? values('en') : values));
    this.name = 'ActionError';
    this.entry = entry;
    this.values = values;
  }

  /** The message in one language. */
  text(language) {
    const values = typeof this.values === 'function' ? this.values(language) : this.values;
    return say(this.entry, language, values);
  }

  /** The message in every language (a widget toast). */
  all() {
    return Object.fromEntries(Object.keys(this.entry).map((lang) => [lang, this.text(lang)]));
  }
}

/** A valid IANA time zone, or undefined (the one of the system). */
function validTimeZone(zone) {
  if (!zone) {
    return undefined;
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

export class MealieHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {Function} [options.request] HTTP seam (src/mealie/http.js)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {string} [options.timeZone] the time zone of Gladys (TZ by default)
   */
  constructor({ gladys, request, timers = true, timings, now, timeZone }) {
    this.gladys = gladys;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.timeZone = validTimeZone(timeZone ?? process.env.TZ);
    this.config = null;
    this.client = null;
    this.signature = null;
    /** What the last good reading saw (kept while Mealie does not answer). */
    this.snapshot = null;
    this.identity = null;
    this.identifiedAt = 0;
    this.error = null;
    this.readAt = 0;
    this.snapshotAt = 0;
    this.connected = false;
    this.polling = null;
    this.pollTimer = null;
    this.stopped = false;
    this.discovered = null;
    this.transport = null;
    this.connection = null;
    this.widgetSignature = null;
    // What fails again at every cycle (Gladys refusing, the reading loop):
    // one line when it starts, one when it ends.
    this.problems = new ProblemLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.discovered = null;
    this.transport = null;
    this.connection = null;
    this.gladys.forgetPublishedStates?.();
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const languageChanged = this.config !== null && this.config.language !== config.language;
    this.config = config;
    if (signature(config) !== this.signature) {
      this.signature = signature(config);
      this.client = config.url
        ? new MealieClient({
            url: config.url,
            token: config.token,
            insecure: config.allowSelfSigned,
            request: this.request,
          })
        : null;
      this.identity = null;
      this.identifiedAt = 0;
      this.error = null;
      this.readAt = 0;
      if (!this.client) {
        this.snapshot = null;
      }
    }
    if (languageChanged) {
      this.discovered = null;
      this.widgetSignature = null;
    }
    await this.pollNow({ publish: true });
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.polling?.catch(() => {});
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    const interval = this.error
      ? Math.min(this.timings.retryMs, this.config.pollIntervalMs)
      : this.config.pollIntervalMs;
    const midnight = msUntilNextDay(this.now(), this.timeZone) + this.timings.midnightDelayMs;
    this.pollTimer = setTimeout(
      async () => {
        try {
          await this.pollNow();
          this.problems.recover('poll', 'Reading Mealie works again');
        } catch (err) {
          this.problems.fail('poll', `Reading loop failed: ${err.message}`, 'error');
          this.schedulePoll();
        }
      },
      Math.min(interval, midnight),
    );
    this.pollTimer.unref?.();
  }

  // --- Reading ----------------------------------------------------------------

  /** Today in the time zone of Gladys. */
  today() {
    return dayKey(this.now(), this.timeZone);
  }

  /**
   * Read Mealie now, publish what changed, and plan the next reading.
   * Concurrent calls share the reading.
   */
  async pollNow({ publish = false } = {}) {
    if (!this.polling) {
      this.polling = this.read().finally(() => {
        this.polling = null;
      });
    }
    const changed = await this.polling;
    await this.afterReading(changed, { publish });
    this.schedulePoll();
  }

  /** Read again when the last reading is older than `freshMs` (scenes, widgets). */
  async refreshIfStale() {
    if (this.client && this.now() - this.readAt >= this.timings.freshMs) {
      await this.pollNow();
    }
  }

  /** @returns {Promise<boolean>} whether the widgets show something new */
  async read() {
    if (!this.client) {
      return false;
    }
    const client = this.client;
    try {
      const now = this.now();
      if (!this.identity || now - this.identifiedAt >= this.timings.identifyEveryMs) {
        this.identity = await client.identify();
        this.identifiedAt = now;
      }
      const today = this.today();
      const [statistics, meals, lists, items] = await Promise.all([
        client.statistics(),
        client.mealPlans(today, addDays(today, WEEK_DAYS - 1)),
        client.shoppingLists(),
        client.uncheckedItems(),
      ]);
      if (client !== this.client) {
        return false; // reconfigured meanwhile
      }
      return this.applySuccess({ statistics, meals, lists, items, today });
    } catch (err) {
      if (!(err instanceof MealieError) || client !== this.client) {
        throw err;
      }
      return this.applyFailure(err);
    }
  }

  applySuccess({ statistics, meals, lists, items, today }) {
    const { version, user } = this.identity;
    const byList = new Map(lists.map((list) => [list.id, []]));
    for (const item of items) {
      // The filter already keeps the unchecked ones; an older Mealie that
      // ignored it would send them all.
      if (item.checked !== true && byList.has(item.shoppingListId)) {
        byList.get(item.shoppingListId).push(item);
      }
    }
    for (const [id, listItems] of byList) {
      byList.set(id, sortItems(listItems));
    }
    const recipes = Number(statistics?.totalRecipes);
    this.snapshot = {
      householdId: user.householdId,
      household: typeof user.household === 'string' ? user.household : null,
      version,
      day: today,
      meals,
      days: groupMeals(meals),
      lists,
      items: byList,
      recipes: Number.isFinite(recipes) ? recipes : null,
    };
    const wasError = this.error;
    this.error = null;
    this.readAt = this.now();
    this.snapshotAt = this.readAt;
    if (!this.connected) {
      this.connected = true;
      logger.info(
        `Connected to Mealie ${version ?? '?'} at ${hostOf(this.config.url)}, household "${
          this.snapshot.household ?? '?'
        }": ${lists.length} shopping list(s)`,
      );
    } else if (wasError) {
      logger.info('Mealie answers again');
    }
    logger.debug(
      `Read: ${meals.length} meal plan entries, ${items.length} item(s) to buy, ${recipes} recipes`,
    );
    return this.widgetChanged();
  }

  applyFailure(err) {
    const previous = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.readAt = this.now();
    if (previous !== err.kind) {
      logger.warn(`Mealie at ${hostOf(this.config.url)}: ${err.message}`);
    } else {
      logger.debug(`Mealie still failing: ${err.message}`);
    }
    // A token refused or a Mealie replaced: ask again who we are next time.
    this.identity = err.kind === ERROR_KINDS.UNREACHABLE ? this.identity : null;
    return previous !== err.kind || this.widgetChanged();
  }

  /** Whether what the widgets show changed since they were last told. */
  widgetChanged() {
    const key = JSON.stringify([
      this.error?.kind ?? null,
      this.snapshot?.day,
      this.snapshot?.meals.map((entry) => [entry.id, entry.date, entry.entryType, entry.recipeId]),
      this.snapshot?.lists.map((list) => [list.id, list.name]),
      [...(this.snapshot?.items.values() ?? [])].flat().map((item) => [item.id, item.display]),
    ]);
    if (key === this.widgetSignature) {
      return false;
    }
    this.widgetSignature = key;
    return true;
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  deviceId() {
    return this.snapshot ? householdIds(this.gladys, this.snapshot.householdId).device : null;
  }

  isCreated() {
    const id = this.deviceId();
    return Boolean(id) && (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  async afterReading(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishStates();
    await this.publishTransport();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.refreshWidgets();
    }
  }

  refreshWidgets() {
    for (const key of Object.values(WIDGET_KEYS)) {
      this.gladys.requestWidgetRefresh(key);
    }
  }

  /** Publish the Discovery list when it changed (a shopping list added or renamed...). */
  async publishDevices({ force = false } = {}) {
    if (!this.snapshot && !(force && !this.client)) {
      return;
    }
    const devices = this.snapshot
      ? [buildDevice(this.gladys, this.snapshot, this.config.language)]
      : [];
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** The states of the device, once the user added it (Gladys drops the others). */
  async publishStates() {
    if (!this.snapshot || !this.isCreated()) {
      return;
    }
    const states = featureStates(
      this.gladys,
      this.snapshot,
      (offset) => this.mealsOn(offset),
      pick(NOTHING_PLANNED, this.config.language),
    );
    try {
      const { count } = await this.gladys.publishChangedStates(states, {
        heartbeat: this.timings.heartbeatMs,
      });
      if (count > 0) {
        logger.debug(`${count} state(s) published`);
      }
      this.problems.recover('states', 'States accepted again');
    } catch (err) {
      this.problems.fail('states', `States refused: ${err.message}`);
    }
  }

  /** The badge of the device: "local", or "unreachable" while Mealie does not answer. */
  async publishTransport({ force = false } = {}) {
    if (!this.snapshot || !this.isCreated()) {
      return;
    }
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    if (!force && transport === this.transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([{ external_id: this.deviceId(), transport }]);
      this.transport = transport;
      this.problems.recover('transports', 'Transport accepted again');
    } catch (err) {
      this.problems.fail('transports', `Transport refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.client) {
      return {
        connected: false,
        message: this.config.invalidUrl ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl,
      };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: this.readAt > 0 };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection || (status.connected === false && !status.message)) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  /** The user added the device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    const id = this.deviceId();
    if (!id || device?.external_id !== id) {
      return;
    }
    this.gladys.forgetPublishedStates?.(id);
    await this.publishStates();
    await this.publishTransport({ force: true });
    this.refreshWidgets();
  }

  // --- Views -----------------------------------------------------------------------

  /** The meals of a day: offset from the day of the last reading. */
  mealsOn(offset) {
    if (!this.snapshot) {
      return new Map();
    }
    return this.snapshot.days.get(addDays(this.snapshot.day, offset)) ?? new Map();
  }

  /** The error of the last reading, in words. */
  errorText(language) {
    return this.error ? pick(ERROR_TEXT[this.error.kind], language) : '';
  }

  /** The integration can answer: configured, and the last reading worked. */
  async assertReadable() {
    if (!this.client) {
      throw new ActionError(ACTION_TEXT.notConfigured);
    }
    await this.refreshIfStale();
    if (this.error || !this.snapshot) {
      throw new ActionError(ACTION_TEXT.unavailable, (language) => ({
        error: this.errorText(language) || pick(ERROR_TEXT[ERROR_KINDS.UNREACHABLE], language),
      }));
    }
  }

  /** The shopping list a person named (empty: the first one created). */
  resolveList(name) {
    const { lists } = this.snapshot;
    if (lists.length === 0) {
      throw new ActionError(ACTION_TEXT.noList);
    }
    const list = findList(lists, name);
    if (!list) {
      throw new ActionError(ACTION_TEXT.listNotFound, {
        list: String(name).trim(),
        lists: lists.map((entry) => entry.name).join(', '),
      });
    }
    return list;
  }

  itemsOf(list) {
    return this.snapshot.items.get(list.id) ?? [];
  }

  /** A Mealie refusal of a write, in words. */
  refusal(err) {
    if (err instanceof MealieError) {
      return new ActionError(ACTION_TEXT.failed, (language) => ({
        error: pick(ERROR_TEXT[err.kind], language),
      }));
    }
    return err;
  }

  /**
   * Add an item to a shopping list, unless it is already there unchecked
   * ("milk is finished" said twice adds one milk).
   * @returns {Promise<{ added: boolean, item: string, list: object, message: ActionError }>}
   *   `message`: what to tell the user (an ActionError used as a text)
   */
  async addItem(text, listName) {
    const item = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
    if (!item) {
      throw new ActionError(ACTION_TEXT.itemMissing);
    }
    await this.assertReadable();
    const list = this.resolveList(listName);
    const existing = this.itemsOf(list).find((entry) => itemMatches(entry, item));
    if (existing) {
      return {
        added: false,
        item: itemName(existing),
        list,
        message: new ActionError(ACTION_TEXT.itemAlready, {
          item: short(itemName(existing)),
          list: list.name,
        }),
      };
    }
    try {
      await this.client.addItem(list.id, item.slice(0, 500));
    } catch (err) {
      throw this.refusal(err);
    }
    logger.info(`"${item}" added to the shopping list "${list.name}"`);
    await this.pollNow();
    return {
      added: true,
      item,
      list,
      message: new ActionError(ACTION_TEXT.itemAdded, { item: short(item), list: list.name }),
    };
  }

  /**
   * Check an item of a shopping list (Mealie keeps it, checked: unchecking it
   * in Mealie undoes this).
   * @param {object} what `{ name }` as a person says it, or `{ id }` (widget form)
   */
  async checkItem({ name, id }, listName) {
    await this.assertReadable();
    let list;
    let item;
    if (id) {
      for (const candidate of this.snapshot.lists) {
        item = this.itemsOf(candidate).find((entry) => entry.id === id);
        if (item) {
          list = candidate;
          break;
        }
      }
      list ??= this.resolveList(listName);
    } else {
      list = this.resolveList(listName);
      const items = this.itemsOf(list);
      item = items.find((entry) => itemMatches(entry, name));
      if (!item) {
        // "tomates" for "Tomate (1,5 kg)": the only item whose name contains it.
        const target = normalizeName(name);
        const close = target
          ? items.filter((entry) => normalizeName(itemName(entry)).includes(target))
          : [];
        item = close.length === 1 ? close[0] : undefined;
      }
    }
    if (!item) {
      const wanted = String(name ?? '').trim();
      return {
        checked: false,
        item: wanted,
        list,
        message: wanted
          ? new ActionError(ACTION_TEXT.itemNotFound, { item: short(wanted), list: list.name })
          : new ActionError(ACTION_TEXT.itemGone, { list: list.name }),
      };
    }
    try {
      await this.client.setItemChecked(item.id, true);
    } catch (err) {
      throw this.refusal(err);
    }
    logger.info(`"${itemName(item)}" checked on the shopping list "${list.name}"`);
    await this.pollNow();
    return {
      checked: true,
      item: itemName(item),
      list,
      message: new ActionError(ACTION_TEXT.itemChecked, {
        item: short(itemName(item)),
        list: list.name,
      }),
    };
  }

  /**
   * Put a recipe in the meal plan; an empty name lets Mealie pick one (its
   * meal plan rules apply). The same recipe already planned for the same meal
   * of the same day is not added twice.
   */
  async planMeal({ recipe: wanted, day = 'today', meal = 'dinner' }) {
    await this.assertReadable();
    const offset = DAYS[day] ?? 0;
    const dayName = Object.keys(DAYS).find((key) => DAYS[key] === offset);
    const type = ENTRY_TYPES.includes(meal) ? meal : 'dinner';
    const date = addDays(this.today(), offset);
    const values = (recipe) => (language) => ({
      recipe: short(recipe),
      day: pick(DAY_TEXT[dayName], language).toLowerCase(),
      meal: pick(MEAL_TEXT[type], language).toLowerCase(),
    });
    const query = typeof wanted === 'string' ? wanted.trim() : '';

    let entry;
    let recipe;
    try {
      if (query) {
        recipe = pickRecipe(await this.client.searchRecipes(query), query);
        if (!recipe) {
          throw new ActionError(ACTION_TEXT.recipeNotFound, { recipe: query });
        }
        const already = this.snapshot.meals.some(
          (planned) =>
            planned.date === date && planned.entryType === type && planned.recipeId === recipe.id,
        );
        if (already) {
          return {
            added: false,
            recipe: recipe.name,
            date,
            message: new ActionError(ACTION_TEXT.mealAlready, values(recipe.name)),
          };
        }
        entry = await this.client.addMealPlanEntry(date, type, recipe.id);
      } else {
        entry = await this.client.addRandomMealPlanEntry(date, type);
      }
    } catch (err) {
      if (err instanceof MealieError && err.status === 422 && RECENT_ENTRY_TYPES.includes(type)) {
        throw new ActionError(ACTION_TEXT.mealTypeTooNew);
      }
      if (err instanceof MealieError && !query && err.status === 404) {
        throw new ActionError(ACTION_TEXT.noRecipe); // "no recipes match your rules"
      }
      throw this.refusal(err);
    }
    const name = entry?.recipe?.name ?? recipe?.name ?? query;
    logger.info(`"${name}" added to the meal plan (${date}, ${type})`);
    await this.pollNow();
    return {
      added: true,
      recipe: name,
      date,
      message: new ActionError(ACTION_TEXT.mealAdded, values(name)),
    };
  }

  /** "Test the connection": read Mealie now (who am I included), one report. */
  async testConnection() {
    if (this.client) {
      this.identity = null;
    }
    await this.pollNow({ publish: true });
    const message = {};
    for (const language of Object.keys(REPORT_TEXT.ok)) {
      const status = this.connectionStatus();
      if (!this.client) {
        message[language] = pick(status.message, language);
      } else if (this.error) {
        message[language] = say(REPORT_TEXT.failed, language, {
          host: hostOf(this.config.url),
          error: this.errorText(language),
        });
      } else {
        const { snapshot } = this;
        message[language] = [
          say(REPORT_TEXT.ok, language, {
            version: snapshot.version ?? '?',
            household: snapshot.household ?? '?',
          }),
          say(REPORT_TEXT.counts, language, {
            recipes: snapshot.recipes ?? '?',
            meals: [...this.mealsOn(0).values()].flat().length,
            lists: snapshot.lists.length,
            items: [...snapshot.items.values()].flat().length,
          }),
        ].join('\n');
      }
    }
    logger.info('Connection tested from the configuration screen');
    return message;
  }
}
