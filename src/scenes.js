// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// Writing: add an item to a shopping list ("the milk is finished", from a
// button or a voice assistant scene), check one, put a recipe in the meal
// plan. Each is small and undone in Mealie in one tap.
//
// Reading, for what a condition cannot do: put the menu of a day or the
// content of a list in a message ("Tonight: Bœuf bourguignon", "To buy:
// milk, bread, eggs"). Both read Mealie again when the last reading is older
// than 30 seconds.
//
// Errors are thrown in the language of the configuration (a scene action
// does not receive the user's language).
// -----------------------------------------------------------------------------

import { ActionError, DAYS } from './hub.js';
import { itemLabel } from './mealie/model.js';
import { MEAL_FEATURES } from './devices.js';
import { MEAL_TEXT, NOTHING_PLANNED, pick } from './texts.js';

// Items listed in the `items` output, at most (the rest is counted).
export const MAX_LISTED_ITEMS = 50;

/** Run an operation; an ActionError becomes an error in the configured language. */
async function run(hub, operation) {
  try {
    return await operation();
  } catch (err) {
    if (err instanceof ActionError) {
      throw new Error(err.text(hub.config?.language ?? 'en'), { cause: err });
    }
    throw err;
  }
}

const toBuy = (hub, list) => hub.itemsOf(list).length;

export const SCENE_ACTIONS = {
  add_shopping_item: (hub, { fields = {} }) =>
    run(hub, async () => {
      const result = await hub.addItem(fields.item, fields.list);
      return {
        added: result.added,
        item: result.item,
        list: result.list.name,
        to_buy: toBuy(hub, result.list),
      };
    }),

  check_shopping_item: (hub, { fields = {} }) =>
    run(hub, async () => {
      const result = await hub.checkItem({ name: fields.item }, fields.list);
      return {
        checked: result.checked,
        item: result.item,
        list: result.list.name,
        to_buy: toBuy(hub, result.list),
      };
    }),

  add_to_meal_plan: (hub, { fields = {} }) =>
    run(hub, async () => {
      const result = await hub.planMeal({
        recipe: fields.recipe,
        day: fields.day,
        meal: fields.meal,
      });
      return { added: result.added, recipe: result.recipe, date: result.date };
    }),

  get_meals: (hub, { fields = {} }) =>
    run(hub, async () => {
      await hub.assertReadable();
      const language = hub.config.language;
      const nothing = pick(NOTHING_PLANNED, language);
      const meals = hub.mealsOn(DAYS[fields.day] ?? 0);
      const outputs = {};
      for (const meal of MEAL_FEATURES) {
        outputs[meal] = (meals.get(meal) ?? []).join(', ') || nothing;
      }
      const separator = language === 'fr' ? ' : ' : ': ';
      const lines = [...meals].map(
        ([type, titles]) => `${pick(MEAL_TEXT[type], language)}${separator}${titles.join(', ')}`,
      );
      outputs.summary = lines.join(' · ') || nothing;
      outputs.count = [...meals.values()].flat().length;
      return outputs;
    }),

  get_shopping_list: (hub, { fields = {} }) =>
    run(hub, async () => {
      await hub.assertReadable();
      const list = hub.resolveList(fields.list);
      const items = hub.itemsOf(list);
      const listed = items
        .slice(0, MAX_LISTED_ITEMS)
        .map((item) => itemLabel(item, hub.config.language));
      return {
        list: list.name,
        to_buy: items.length,
        items:
          items.length > listed.length
            ? `${listed.join(', ')}, +${items.length - listed.length}`
            : listed.join(', '),
      };
    }),
};
