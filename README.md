# Mealie for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that
brings [Mealie](https://mealie.io/), the self-hosted recipe manager, into
Gladys: the meals of the meal plan and the shopping lists as a device, scene
actions to add or check an item and to plan a recipe, and two dashboard
widgets with buttons. It talks to the REST API of Mealie 2.x and later with an
API token, over the local network. No cloud, no account.

> Tested against real Mealie 2.0.0 and 3.28 servers, not yet in a real Gladys:
> feedback welcome in the [issues](https://github.com/guim31/gladys-mealie/issues).

## Features

- **One device per Mealie household**, proposed in the Discover tab:
  **breakfast, lunch and dinner of today and tomorrow** (texts: the recipes or
  notes of the meal plan, "Nothing planned" otherwise), the **number of
  recipes**, and for **each shopping list the number of items still to buy**.
  Feature names in French by default (English, German and Spanish available).
- **Scene actions**: _Add to the shopping list_ (never twice: "the milk is
  finished" said twice adds one milk), _Check a shopping list item_, _Add a
  recipe to the meal plan_ (by name, or a random one picked by Mealie), _Get the
  meals of a day_ and _Get a shopping list_ (for a message).
- **Dashboard widgets**: _Meal plan_ (today's meals, or the next seven days),
  with a **Plan** button that opens a form (recipe, day, meal); _Shopping list_
  (the items to buy on one list), with **Add** (a form with one text field)
  and **Check** (a form listing the items). Both with **Refresh**, and **Open
  Mealie** for an HTTPS Mealie.
- A **Test the connection** button, a connection status naming the problem
  (address, token, certificate, Mealie 1.x), a **transport badge** on the
  device.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.2.0** or later (widget buttons with forms).
- **Mealie 2.0 or later**, reachable from the Gladys machine (Mealie 1.x has
  no household API). The snack, drink and dessert meals need Mealie 3.7.
- An **API token** of a Mealie user (profile → API Tokens).

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-mealie` (or
   install **Mealie** from the catalog once it is listed).
2. In **Configuration**, enter the address of Mealie
   (`http://192.168.1.2:9925`, `https://mealie.example.com`…) and the API
   token. Save, then click **Test the connection**.
3. Open the **Discover** tab and add the **Mealie** device.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- Every refresh interval (1 to 15 min, 5 min by default) and right after
  midnight in the time zone of Gladys, the integration reads: the meal plan
  of the next seven days (`GET /api/households/mealplans`), the shopping lists,
  the unchecked items of every list in one request
  (`GET /api/households/shopping/items?queryFilter=checked=false`) and the
  household statistics. Who the token is (`/api/app/about`,
  `/api/users/self`) is read at start, after an error and once an hour.
  Mealie sets no API quota.
- **Identity**: the household id of the token's user. Changing the address of
  Mealie keeps the device; each list counter is keyed on the Mealie list id.
- The device is published with `should_poll: false`: the integration reads
  Mealie on its own timer (the Gladys scheduler does not reliably poll external
  devices, Gladys#3198), and `onPoll` reads it at once as a fallback.
- Only the values that changed are sent to Gladys (the SDK's
  `publishChangedStates`), every value again every 6 hours, and all of them
  when the device is added or Gladys reconnects.
- **Writes are small and reversible**: an item added (as a note, quantity 0,
  as the Mealie app does), an item checked (the item is read and sent back
  whole: Mealie's `PUT` replaces the item), a meal plan entry added. Nothing is
  ever deleted.
- HTTP(S) runs on `node:http` / `node:https`, so a self-signed certificate can
  be accepted for this Mealie only, when the user ticks the option.

## Checked on a real Mealie, and what was not

On 14/10/2026, Mealie 3.28 (development build) and 2.0.0 ran from their
sources with SQLite, filled through their API (recipes, a week of meal plan
with recipes and notes, two lists, items with a food, a unit and a note). The
optional test `npm run test:real` (with `MEALIE_URL`, `MEALIE_TOKEN`, and
`MEALIE_WRITE=1` for the writes) passed against both, and against Mealie 3.28
behind HTTPS with a self-signed certificate (refused without the option,
accepted with it). The integration also ran in its Docker image with the Gladys
sandbox constraints (read-only root, all capabilities dropped, 256 MB, bridge
network): connection, device, states, widgets, add and check against the real
Mealie, ~19 MB at rest without Gladys, a clean exit on SIGTERM, the token never
in the logs. Its answers are kept in `test/fixtures/mealie/real/`.

Not checked: a real Gladys (rendering of the widgets and their forms, the
scene editor), Mealie with PostgreSQL, a reverse proxy with a sub-path, OIDC
or LDAP users.

## Limitations

- One Mealie household per integration (the household of the token's user).
- The device shows breakfast, lunch and dinner of today and tomorrow; the
  other meals and the rest of the week are in the widget and the scene action.
- Items are added as free text (no quantity parsing); checked items stay in
  Mealie until cleared there.
- No scene trigger: what changes in Mealie is a state of the device.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
MEALIE_URL=http://127.0.0.1:9925 MEALIE_TOKEN=... npm run test:real
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Mealie (`test/helpers/fakeMealie.js`) seeded with real answers
of Mealie 3.28 (`test/fixtures/mealie/real/`) and the fixtures of the Home
Assistant tests. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Mealie](https://github.com/mealie-recipes/mealie) by Hayden and contributors
  (AGPL-3.0): read to understand its API, not copied; the names of the meals
  are those of its interface.
- [aiomealie](https://github.com/joostlek/python-mealie) by Joost Lekkerkerker
  (MIT), the library of Home Assistant's
  [`mealie`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/mealie)
  integration (Apache-2.0): the endpoints and the features chosen; the Home
  Assistant test fixtures are reused in `test/fixtures/mealie/home-assistant/`.
- The architecture and the conformity tests follow
  [gladys-uptime-kuma](https://github.com/guim31/gladys-uptime-kuma),
  [gladys-pihole](https://github.com/guim31/gladys-pihole) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Mealie or its
authors.

## License

[Apache-2.0](LICENSE).
