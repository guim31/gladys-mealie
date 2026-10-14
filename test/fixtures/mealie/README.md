# Mealie fixtures

- `real/`: answers of a real Mealie 3.28 (development build of 14 October 2026,
  `version: "develop"`), run locally with SQLite and filled through its API:
  four recipes, a week of meal plan (recipes and notes), two shopping lists.
  The API tokens of the user (`tokens`) and `cacheKey` were removed; the ids
  are the random UUIDs of that throw-away instance, the e-mail is Mealie's
  default `changeme@example.com`.
- `home-assistant/`: fixtures of the Home Assistant `mealie` integration tests
  (`tests/components/mealie/fixtures`, Apache-2.0), answers of real Mealie
  servers of 2024 (Dutch, English, Spanish, Greek and German recipes).
