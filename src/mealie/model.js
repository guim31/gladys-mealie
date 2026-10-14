// -----------------------------------------------------------------------------
// Pure functions over the Mealie answers: days in the time zone of Gladys,
// meal plan entries grouped by day and meal type, shopping list items named
// and compared the way a person says them ("lait" finds "Lait", "oeufs" finds
// "Œufs").
// -----------------------------------------------------------------------------

import { ENTRY_TYPES } from './client.js';

const formatters = new Map();

/** Today in a time zone, as `YYYY-MM-DD`. */
export function dayKey(timestamp, timeZone) {
  if (!formatters.has(timeZone)) {
    // en-CA formats a date as YYYY-MM-DD.
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    );
  }
  return formatters.get(timeZone).format(new Date(timestamp));
}

/** `YYYY-MM-DD` plus a number of days (calendar arithmetic, no time zone involved). */
export function addDays(day, count) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

/** Milliseconds until the next midnight of a time zone (at least one minute). */
export function msUntilNextDay(timestamp, timeZone) {
  // Search the instant the day changes: exact across daylight saving changes.
  const today = dayKey(timestamp, timeZone);
  let low = timestamp;
  let high = timestamp + 26 * 3600_000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (dayKey(middle, timeZone) === today) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return Math.max(60_000, high - timestamp);
}

/** The text of a meal plan entry: the recipe name, or the title of a note. */
export function entryTitle(entry) {
  const recipe = entry?.recipe?.name;
  if (typeof recipe === 'string' && recipe.trim()) {
    return recipe.trim();
  }
  for (const key of ['title', 'text']) {
    if (typeof entry?.[key] === 'string' && entry[key].trim()) {
      return entry[key].trim().replace(/\s+/g, ' ');
    }
  }
  return null;
}

/**
 * The meal plan, by day then by meal type, in the order of a day.
 * @param {object[]} entries meal plan entries of Mealie
 * @returns {Map<string, Map<string, string[]>>} day → entry type → titles
 */
export function groupMeals(entries) {
  const sorted = [...entries].sort(
    (a, b) =>
      String(a.date).localeCompare(String(b.date)) ||
      typeIndex(a.entryType) - typeIndex(b.entryType) ||
      (Number(a.id) || 0) - (Number(b.id) || 0),
  );
  const days = new Map();
  for (const entry of sorted) {
    const title = entryTitle(entry);
    if (typeof entry.date !== 'string' || !title) {
      continue;
    }
    const type = ENTRY_TYPES.includes(entry.entryType) ? entry.entryType : 'side';
    if (!days.has(entry.date)) {
      days.set(entry.date, new Map());
    }
    const meals = days.get(entry.date);
    if (!meals.has(type)) {
      meals.set(type, []);
    }
    meals.get(type).push(title);
  }
  return days;
}

const typeIndex = (type) => {
  const index = ENTRY_TYPES.indexOf(type);
  return index === -1 ? ENTRY_TYPES.length : index;
};

/**
 * A name as people say it, to compare two of them: no case, no accents, no
 * ligatures, single spaces. "Œufs " and "oeufs" are the same item.
 */
export function normalizeName(text) {
  return String(text ?? '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const clean = (text) => (typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '');

/** What an item is: its food when it has one ("tomato"), its note otherwise ("milk"). */
export function itemName(item) {
  return clean(item?.food?.name) || clean(item?.note) || clean(item?.display) || '?';
}

/** A quantity in the language of the user: 1.5 → "1,5" in French. */
export function formatQuantity(quantity, language) {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(quantity);
}

/**
 * The details of an item, besides its name: "1,5 kg · bien mûres", "×2", or ''.
 * A bare note counts one when Mealie says 1 (the default of its form): only
 * a higher quantity is worth showing.
 */
export function itemDetail(item, language) {
  const quantity = Number(item?.quantity);
  const unit = clean(item?.unit?.abbreviation) || clean(item?.unit?.name);
  const hasFood = Boolean(clean(item?.food?.name));
  if (!hasFood && !unit) {
    return Number.isFinite(quantity) && quantity > 1
      ? `×${formatQuantity(quantity, language)}`
      : '';
  }
  const amount = [
    Number.isFinite(quantity) && quantity > 0 ? formatQuantity(quantity, language) : '',
    unit,
  ]
    .filter(Boolean)
    .join(' ');
  const note = hasFood ? clean(item?.note) : '';
  return [amount, note].filter(Boolean).join(' · ');
}

/** Name and details in one line: "Tomate (1,5 kg · bien mûres)". */
export function itemLabel(item, language) {
  const detail = itemDetail(item, language);
  return detail ? `${itemName(item)} (${detail})` : itemName(item);
}

/** A name without its plural mark ("tomates" → "tomate", "choux" → "chou"), word by word. */
export function stem(name) {
  return name
    .split(' ')
    .map((word) => (word.length > 3 ? word.replace(/(?<=[^s])[sx]$/, '') : word))
    .join(' ');
}

/** Whether an item is the one a person named ("tomates" is the item "Tomate"). */
export function itemMatches(item, wanted) {
  const target = stem(normalizeName(wanted));
  if (!target) {
    return false;
  }
  return [itemName(item), item?.note, item?.display].some(
    (name) => stem(normalizeName(name)) === target,
  );
}

/** The items of one list in the order of the Mealie app (position, then age). */
export function sortItems(items) {
  return [...items].sort(
    (a, b) =>
      (Number(a.position) || 0) - (Number(b.position) || 0) ||
      String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')),
  );
}

/**
 * The list a person named: same name first, then the only list whose name
 * starts with (or contains) what was typed. Empty: the first list created,
 * usually the household's main one.
 * @returns {object|null}
 */
export function findList(lists, wanted) {
  if (lists.length === 0) {
    return null;
  }
  const target = normalizeName(wanted);
  if (!target) {
    return [...lists].sort((a, b) =>
      String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')),
    )[0];
  }
  const names = lists.map((list) => ({ list, name: normalizeName(list.name) }));
  const exact = names.find((entry) => entry.name === target);
  if (exact) {
    return exact.list;
  }
  for (const test of [(name) => name.startsWith(target), (name) => name.includes(target)]) {
    const found = names.filter((entry) => test(entry.name));
    if (found.length === 1) {
      return found[0].list;
    }
  }
  return null;
}

/** The recipe a person named, among search results: same name first, else the first. */
export function pickRecipe(recipes, wanted) {
  const target = normalizeName(wanted);
  return recipes.find((recipe) => normalizeName(recipe.name) === target) ?? recipes[0] ?? null;
}
