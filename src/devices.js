// -----------------------------------------------------------------------------
// One Gladys device per Mealie household, proposed in the Discovery tab.
//
// Identity: the household id Mealie gives (`householdId` of the token's user),
// never the address: changing the address of Mealie (an IP for a name, HTTP
// for HTTPS) keeps the device, its history and its scenes.
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - the breakfast, lunch and dinner of today and of tomorrow: text/text,
//     the recipe (or note) titles of the Mealie meal plan, "Nothing planned"
//     when the slot is empty (Gladys ignores an empty text);
//   - the number of recipes: counter-sensor/integer;
//   - one counter-sensor/integer per shopping list: the items still to buy.
//     A list created in Mealie adds a feature: Gladys then offers "Update"
//     in the Discovery tab. Its id is the Mealie list id: renaming the list
//     keeps it (the feature name stays the one of its creation, as for every
//     Gladys feature).
//
// Published with should_poll: false: the integration reads Mealie on its own
// timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'household';
export const MODEL = 'Mealie';

// The meals followed as features, and the days (offset from today).
export const MEAL_FEATURES = Object.freeze(['breakfast', 'lunch', 'dinner']);
export const MEAL_DAYS = Object.freeze({ today: 0, tomorrow: 1 });

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  TODAY_BREAKFAST: 'today_breakfast',
  TODAY_LUNCH: 'today_lunch',
  TODAY_DINNER: 'today_dinner',
  TOMORROW_BREAKFAST: 'tomorrow_breakfast',
  TOMORROW_LUNCH: 'tomorrow_lunch',
  TOMORROW_DINNER: 'tomorrow_dinner',
  RECIPES: 'recipes',
});

/** Feature key of the items to buy on a list: `list_<Mealie list id>`. */
export const listFeatureKey = (listId) => `list_${String(listId).toLowerCase()}`;

/** Feature key of a meal on a day. */
export const mealFeatureKey = (day, meal) => `${day}_${meal}`;

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.TODAY_BREAKFAST]: 'Breakfast today',
    [FEATURE_KEYS.TODAY_LUNCH]: 'Lunch today',
    [FEATURE_KEYS.TODAY_DINNER]: 'Dinner today',
    [FEATURE_KEYS.TOMORROW_BREAKFAST]: 'Breakfast tomorrow',
    [FEATURE_KEYS.TOMORROW_LUNCH]: 'Lunch tomorrow',
    [FEATURE_KEYS.TOMORROW_DINNER]: 'Dinner tomorrow',
    [FEATURE_KEYS.RECIPES]: 'Recipes',
    list: 'To buy: {list}',
  },
  fr: {
    [FEATURE_KEYS.TODAY_BREAKFAST]: "Petit-déjeuner aujourd'hui",
    [FEATURE_KEYS.TODAY_LUNCH]: "Déjeuner aujourd'hui",
    [FEATURE_KEYS.TODAY_DINNER]: "Dîner aujourd'hui",
    [FEATURE_KEYS.TOMORROW_BREAKFAST]: 'Petit-déjeuner demain',
    [FEATURE_KEYS.TOMORROW_LUNCH]: 'Déjeuner demain',
    [FEATURE_KEYS.TOMORROW_DINNER]: 'Dîner demain',
    [FEATURE_KEYS.RECIPES]: 'Recettes',
    list: 'À acheter : {list}',
  },
  de: {
    [FEATURE_KEYS.TODAY_BREAKFAST]: 'Frühstück heute',
    [FEATURE_KEYS.TODAY_LUNCH]: 'Mittagessen heute',
    [FEATURE_KEYS.TODAY_DINNER]: 'Abendessen heute',
    [FEATURE_KEYS.TOMORROW_BREAKFAST]: 'Frühstück morgen',
    [FEATURE_KEYS.TOMORROW_LUNCH]: 'Mittagessen morgen',
    [FEATURE_KEYS.TOMORROW_DINNER]: 'Abendessen morgen',
    [FEATURE_KEYS.RECIPES]: 'Rezepte',
    list: 'Zu kaufen: {list}',
  },
  es: {
    [FEATURE_KEYS.TODAY_BREAKFAST]: 'Desayuno de hoy',
    [FEATURE_KEYS.TODAY_LUNCH]: 'Comida de hoy',
    [FEATURE_KEYS.TODAY_DINNER]: 'Cena de hoy',
    [FEATURE_KEYS.TOMORROW_BREAKFAST]: 'Desayuno de mañana',
    [FEATURE_KEYS.TOMORROW_LUNCH]: 'Comida de mañana',
    [FEATURE_KEYS.TOMORROW_DINNER]: 'Cena de mañana',
    [FEATURE_KEYS.RECIPES]: 'Recetas',
    list: 'Por comprar: {list}',
  },
};

// Display bounds (the core never applies them on write).
export const MAX_ITEMS = 1000;
export const MAX_RECIPES = 100_000;
// Gladys stores a text state whole: a day with five recipes in one slot stays
// readable, a longer one is cut.
export const MAX_TEXT_LENGTH = 250;
const MAX_NAME_LENGTH = 100;

// No version param: a Mealie update would make Gladys offer "Update" on the
// device for nothing (the version is in "Test the connection").
export const PARAMS = Object.freeze({ HOUSEHOLD: 'MEALIE_HOUSEHOLD' });

/** External ids of the device of a household and its features. */
export const householdIds = (gladys, householdId) =>
  gladys.externalIds(DEVICE_TYPE, String(householdId).toLowerCase());

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * The discovery payload of the household.
 * @param {object} gladys SDK client
 * @param {object} snapshot see src/hub.js: { householdId, household, lists }
 * @param {string} language feature names language
 */
export function buildDevice(gladys, snapshot, language = 'fr') {
  const ids = householdIds(gladys, snapshot.householdId);
  const names = NAMES[language] ?? NAMES.en;
  const text = (key) => ({
    name: names[key],
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    // NOT NULL in Gladys, even for a text: without them "Add" fails (422).
    min: 0,
    max: 0,
  });
  const counter = (key, name, max) => ({
    name,
    external_id: ids.feature(key),
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max,
  });

  const features = [];
  for (const day of Object.keys(MEAL_DAYS)) {
    for (const meal of MEAL_FEATURES) {
      features.push(text(mealFeatureKey(day, meal)));
    }
  }
  features.push(counter(FEATURE_KEYS.RECIPES, names[FEATURE_KEYS.RECIPES], MAX_RECIPES));
  const used = new Set(features.map((feature) => feature.name));
  for (const list of snapshot.lists) {
    let name = fit(names.list.replace('{list}', list.name || '?'), MAX_NAME_LENGTH);
    // Two lists with the same name: Gladys shows the features side by side.
    for (let n = 2; used.has(name); n += 1) {
      name = fit(`${names.list.replace('{list}', list.name || '?')} (${n})`, MAX_NAME_LENGTH);
    }
    used.add(name);
    features.push(counter(listFeatureKey(list.id), name, MAX_ITEMS));
  }

  const params = [];
  if (snapshot.household) {
    params.push({ name: PARAMS.HOUSEHOLD, value: fit(snapshot.household, 255) });
  }
  return {
    name: 'Mealie',
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params,
    features,
  };
}

/**
 * The value of every feature (text features carry `text`, counters `state`).
 * @param {object} snapshot see src/hub.js
 * @param {(day: number) => Map<string, string[]>} mealsOn meals of a day offset
 * @param {string} nothing the text of an empty slot
 * @returns {Array<{ device_feature_external_id: string, state?: number, text?: string }>}
 */
export function featureStates(gladys, snapshot, mealsOn, nothing) {
  const ids = householdIds(gladys, snapshot.householdId);
  const states = [];
  for (const [day, offset] of Object.entries(MEAL_DAYS)) {
    const meals = mealsOn(offset);
    for (const meal of MEAL_FEATURES) {
      const titles = meals.get(meal) ?? [];
      states.push({
        device_feature_external_id: ids.feature(mealFeatureKey(day, meal)),
        text: titles.length > 0 ? fit(titles.join(' · '), MAX_TEXT_LENGTH) : nothing,
      });
    }
  }
  if (typeof snapshot.recipes === 'number') {
    states.push({
      device_feature_external_id: ids.feature(FEATURE_KEYS.RECIPES),
      state: snapshot.recipes,
    });
  }
  for (const list of snapshot.lists) {
    states.push({
      device_feature_external_id: ids.feature(listFeatureKey(list.id)),
      state: (snapshot.items.get(list.id) ?? []).length,
    });
  }
  return states;
}
