// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the feature names
// (src/devices.js) and the widgets (src/widgets.js): connection status, errors,
// the "Test the connection" report, scene action outputs and errors. Four
// languages, the four of the Gladys interface; German says "du", Spanish
// "usted". The meal names are the ones of the Mealie interface.
// test/i18n.test.js checks every table.
//
// A `{name}` in a text is replaced by format().
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './mealie/client.js';

export const LANGUAGE_FALLBACK = 'en';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Mealie and an API token in the configuration.',
    fr: "Saisissez l'adresse de votre Mealie et un jeton d'API dans la configuration.",
    de: 'Gib die Adresse deines Mealie und ein API-Token in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Mealie y un token de API en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.2:9925',
    fr: 'Adresse incomprise, ex. http://192.168.1.2:9925',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.2:9925',
    es: 'Dirección no válida, p. ej. http://192.168.1.2:9925',
  },
};

// One short explanation per error kind (src/mealie/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Mealie does not answer',
    fr: 'Mealie ne répond pas',
    de: 'Mealie antwortet nicht',
    es: 'Mealie no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API token refused: create a new one in Mealie (Profile → API Tokens)',
    fr: "jeton d'API refusé : créez-en un autre dans Mealie (Profil → Jetons de l'API)",
    de: 'API-Token abgelehnt: Erstelle ein neues in Mealie (Profil → API-Token)',
    es: 'token de API rechazado: cree otro en Mealie (Perfil → API Tokens)',
  },
  [ERROR_KINDS.TOKEN_MISSING]: {
    en: 'an API token is needed: create one in Mealie (Profile → API Tokens)',
    fr: "un jeton d'API est nécessaire : créez-le dans Mealie (Profil → Jetons de l'API)",
    de: 'ein API-Token ist nötig: Erstelle es in Mealie (Profil → API-Token)',
    es: 'se necesita un token de API: créelo en Mealie (Perfil → API Tokens)',
  },
  [ERROR_KINDS.FORBIDDEN]: {
    en: 'the user of the API token is not allowed to do this in Mealie',
    fr: "l'utilisateur du jeton d'API n'a pas ce droit dans Mealie",
    de: 'der Benutzer des API-Tokens darf das in Mealie nicht',
    es: 'el usuario del token de API no tiene este permiso en Mealie',
  },
  [ERROR_KINDS.NOT_MEALIE]: {
    en: 'no Mealie at this address',
    fr: 'aucun Mealie à cette adresse',
    de: 'kein Mealie unter dieser Adresse',
    es: 'no hay ningún Mealie en esta dirección',
  },
  [ERROR_KINDS.TOO_OLD]: {
    en: 'Mealie 2.0 or later is needed: update Mealie',
    fr: 'Mealie 2.0 ou plus récent est nécessaire : mettez Mealie à jour',
    de: 'Mealie 2.0 oder neuer ist nötig: Aktualisiere Mealie',
    es: 'se necesita Mealie 2.0 o posterior: actualice Mealie',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer from Mealie, see the logs',
    fr: 'réponse inattendue de Mealie, voir les logs',
    de: 'unerwartete Antwort von Mealie, sieh in den Protokollen nach',
    es: 'respuesta inesperada de Mealie, consulte los registros',
  },
};

// Meal types of the Mealie meal plan (src/mealie/client.js ENTRY_TYPES).
export const MEAL_TEXT = {
  breakfast: { en: 'Breakfast', fr: 'Petit-déjeuner', de: 'Frühstück', es: 'Desayuno' },
  lunch: { en: 'Lunch', fr: 'Déjeuner', de: 'Mittagessen', es: 'Comida' },
  dinner: { en: 'Dinner', fr: 'Dîner', de: 'Abendessen', es: 'Cena' },
  side: { en: 'Side', fr: 'Accompagnement', de: 'Beilage', es: 'Acompañamiento' },
  snack: { en: 'Snack', fr: 'Goûter', de: 'Zwischenmahlzeit', es: 'Merienda' },
  drink: { en: 'Drink', fr: 'Boisson', de: 'Getränk', es: 'Bebida' },
  dessert: { en: 'Dessert', fr: 'Dessert', de: 'Nachspeise', es: 'Postre' },
};

// The days a scene or a widget form can pick (scene action field `day`).
export const DAY_TEXT = {
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  tomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
  day_after_tomorrow: {
    en: 'Day after tomorrow',
    fr: 'Après-demain',
    de: 'Übermorgen',
    es: 'Pasado mañana',
  },
};

// The value of a meal feature on a day with nothing planned: a text state
// is never empty (Gladys ignores an empty one).
export const NOTHING_PLANNED = {
  en: 'Nothing planned',
  fr: 'Rien de prévu',
  de: 'Nichts geplant',
  es: 'Nada previsto',
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  ok: {
    en: 'Connected to Mealie {version}, household "{household}".',
    fr: 'Connecté à Mealie {version}, foyer « {household} ».',
    de: 'Mit Mealie {version} verbunden, Haushalt „{household}“.',
    es: 'Conectado a Mealie {version}, hogar «{household}».',
  },
  counts: {
    en: '{recipes} recipe(s), {meals} meal(s) planned today, {lists} shopping list(s), {items} item(s) to buy.',
    fr: '{recipes} recette(s), {meals} repas prévu(s) aujourd’hui, {lists} liste(s) de courses, {items} article(s) à acheter.',
    de: '{recipes} Rezept(e), {meals} Mahlzeit(en) heute geplant, {lists} Einkaufsliste(n), {items} Eintrag/Einträge zu kaufen.',
    es: '{recipes} receta(s), {meals} comida(s) prevista(s) hoy, {lists} lista(s) de la compra, {items} artículo(s) por comprar.',
  },
  failed: {
    en: 'Mealie at {host}: {error}.',
    fr: 'Mealie à {host} : {error}.',
    de: 'Mealie unter {host}: {error}.',
    es: 'Mealie en {host}: {error}.',
  },
};

// Messages of the scene actions and of the widget buttons. The errors are
// shown in Gladys (scene logs, widget toasts).
export const ACTION_TEXT = {
  notConfigured: {
    en: 'Mealie is not configured.',
    fr: "Mealie n'est pas configuré.",
    de: 'Mealie ist nicht konfiguriert.',
    es: 'Mealie no está configurado.',
  },
  unavailable: {
    en: 'Mealie cannot be read: {error}.',
    fr: 'Mealie est illisible : {error}.',
    de: 'Mealie kann nicht gelesen werden: {error}.',
    es: 'No se puede leer Mealie: {error}.',
  },
  noList: {
    en: 'No shopping list in Mealie: create one first.',
    fr: "Aucune liste de courses dans Mealie : créez-en une d'abord.",
    de: 'Keine Einkaufsliste in Mealie: Erstelle zuerst eine.',
    es: 'No hay ninguna lista de la compra en Mealie: cree una primero.',
  },
  listNotFound: {
    en: 'No shopping list "{list}" in Mealie (lists: {lists}).',
    fr: 'Aucune liste de courses « {list} » dans Mealie (listes : {lists}).',
    de: 'Keine Einkaufsliste „{list}“ in Mealie (Listen: {lists}).',
    es: 'No hay ninguna lista de la compra «{list}» en Mealie (listas: {lists}).',
  },
  itemMissing: {
    en: 'Enter the item to add.',
    fr: "Saisissez l'article à ajouter.",
    de: 'Gib den Eintrag ein, der hinzugefügt werden soll.',
    es: 'Introduzca el artículo que desea añadir.',
  },
  itemAdded: {
    en: '"{item}" added to {list}.',
    fr: '« {item} » ajouté à {list}.',
    de: '„{item}“ zu {list} hinzugefügt.',
    es: '«{item}» añadido a {list}.',
  },
  itemAlready: {
    en: '"{item}" is already on {list}.',
    fr: '« {item} » est déjà sur {list}.',
    de: '„{item}“ steht schon auf {list}.',
    es: '«{item}» ya está en {list}.',
  },
  itemChecked: {
    en: '"{item}" checked on {list}.',
    fr: '« {item} » coché sur {list}.',
    de: '„{item}“ auf {list} abgehakt.',
    es: '«{item}» marcado en {list}.',
  },
  itemNotFound: {
    en: '"{item}" is not on {list}.',
    fr: '« {item} » n’est pas sur {list}.',
    de: '„{item}“ steht nicht auf {list}.',
    es: '«{item}» no está en {list}.',
  },
  itemGone: {
    en: 'This item is no longer to buy on {list}.',
    fr: "Cet article n'est plus à acheter sur {list}.",
    de: 'Dieser Eintrag steht nicht mehr zum Kaufen auf {list}.',
    es: 'Este artículo ya no está por comprar en {list}.',
  },
  recipeNotFound: {
    en: 'No recipe matches "{recipe}" in Mealie.',
    fr: 'Aucune recette ne correspond à « {recipe} » dans Mealie.',
    de: 'Kein Rezept passt zu „{recipe}“ in Mealie.',
    es: 'Ninguna receta coincide con «{recipe}» en Mealie.',
  },
  mealAdded: {
    en: '{recipe} planned: {day}, {meal}.',
    fr: '{recipe} prévu : {day}, {meal}.',
    de: '{recipe} geplant: {day}, {meal}.',
    es: '{recipe} previsto: {day}, {meal}.',
  },
  mealAlready: {
    en: '{recipe} is already planned: {day}, {meal}.',
    fr: '{recipe} est déjà prévu : {day}, {meal}.',
    de: '{recipe} ist schon geplant: {day}, {meal}.',
    es: '{recipe} ya está previsto: {day}, {meal}.',
  },
  mealTypeTooNew: {
    en: 'This Mealie knows breakfast, lunch, dinner and side only: snack, drink and dessert need Mealie 3.7.',
    fr: 'Ce Mealie ne connaît que petit-déjeuner, déjeuner, dîner et accompagnement : goûter, boisson et dessert demandent Mealie 3.7.',
    de: 'Dieses Mealie kennt nur Frühstück, Mittagessen, Abendessen und Beilage: Zwischenmahlzeit, Getränk und Nachspeise brauchen Mealie 3.7.',
    es: 'Este Mealie solo conoce desayuno, comida, cena y acompañamiento: merienda, bebida y postre necesitan Mealie 3.7.',
  },
  noRecipe: {
    en: 'Mealie found no recipe to pick: add recipes first.',
    fr: "Mealie n'a trouvé aucune recette à choisir : ajoutez d'abord des recettes.",
    de: 'Mealie hat kein Rezept zur Auswahl gefunden: Füge zuerst Rezepte hinzu.',
    es: 'Mealie no ha encontrado ninguna receta: añada recetas primero.',
  },
  failed: {
    en: 'Mealie refused: {error}.',
    fr: 'Mealie a refusé : {error}.',
    de: 'Mealie hat abgelehnt: {error}.',
    es: 'Mealie lo ha rechazado: {error}.',
  },
};

export const LANGUAGES = Object.keys(INIT_FAILED);

/** A text in a language, English when missing. */
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** Replace the `{name}` of a text with values. */
export function format(text, values = {}) {
  return text.replace(/\{(\w+)\}/g, (whole, key) =>
    values[key] === undefined || values[key] === null ? whole : String(values[key]),
  );
}

/** A table entry formatted in one language. */
export const say = (entry, language, values) => format(pick(entry, language), values);

/** A table entry formatted in every language (a multi-language toast). */
export function sayAll(entry, values = {}) {
  return Object.fromEntries(
    Object.keys(entry).map((language) => [
      language,
      format(entry[language], typeof values === 'function' ? values(language) : values),
    ]),
  );
}
