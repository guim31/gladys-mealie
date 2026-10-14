// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from the real
// answers of Mealie 3.28 and from the Home Assistant fixtures (three shopping
// lists, meal plans of 2024), in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-uptime-kuma.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG, FakeMealie, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);
const ha = async (name) =>
  JSON.parse(
    await readFile(
      new URL(`./fixtures/mealie/home-assistant/${name}.json`, import.meta.url),
      'utf8',
    ),
  );

/** A Mealie serving the Home Assistant fixtures. */
async function homeAssistantMealie() {
  const mealie = new FakeMealie();
  mealie.lists = (await ha('get_shopping_lists')).items;
  mealie.items = (await ha('get_shopping_items')).items.map((item, index) => ({
    ...item,
    shoppingListId: mealie.lists[index % mealie.lists.length].id,
  }));
  mealie.mealplans = (await ha('get_mealplans')).items.map((entry) => ({
    ...entry,
    date: '2026-10-14',
  }));
  mealie.statisticsBody = await ha('statistics');
  return mealie;
}

async function discover(language, mealie) {
  const w = await createWorld({ mealie, config: { ...CONFIG, language } });
  await w.app.stop();
  return w.fake.discoveredDevices;
}

const scenarios = [
  { label: 'Mealie 3.28, English names', language: 'en', mealie: () => new FakeMealie() },
  { label: 'Mealie 3.28, French names', language: 'fr', mealie: () => new FakeMealie() },
  { label: 'Home Assistant fixtures, German names', language: 'de', mealie: homeAssistantMealie },
  { label: 'Home Assistant fixtures, Spanish names', language: 'es', mealie: homeAssistantMealie },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const devices = await discover(scenario.language, await scenario.mealie());
    assert.equal(devices.length, 1, 'one device per household');
    assert.equal(
      new Set(devices.map((device) => device.external_id)).size,
      devices.length,
      'unique device external ids',
    );

    for (const device of devices) {
      const where = device.name;

      // should_poll: true if and only if poll_frequency is provided, in ms.
      if (device.poll_frequency === undefined) {
        assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
      } else {
        assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
        assert.ok(
          table.poll_frequencies_ms.includes(device.poll_frequency),
          `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
        );
      }

      assert.ok(device.features.length >= 9, `${where}: ${device.features.length} features`);
      const externalIds = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const at = `${where} / ${feature.name}`;
        const pair = table.pairs[`${feature.category}/${feature.type}`];
        assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
        assert.ok(
          pair.label_en && pair.label_fr && pair.icon,
          `${at}: couple without label or icon`,
        );

        assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
        assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
        assert.ok(
          Number.isFinite(feature.min) && Number.isFinite(feature.max),
          `${at}: finite min/max`,
        );
        assert.ok(feature.min <= feature.max, `${at}: min > max`);
        assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${at}: has_feedback must be a boolean`,
        );
        if (feature.unit !== undefined) {
          assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
        }

        assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
        externalIds.add(feature.external_id);
        assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
        names.add(feature.name);
      }
    }
  });
}
