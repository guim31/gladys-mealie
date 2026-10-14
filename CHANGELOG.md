# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-14

### Added

- One Gladys device per Mealie household, proposed in the Discover tab:
  breakfast, lunch and dinner of today and tomorrow from the Mealie meal plan
  (recipes or notes, "Nothing planned" otherwise), the number of recipes, and
  the number of items still to buy on each shopping list. Feature names are in
  French by default (English, German and Spanish available).
- Mealie 2.0 and later, through its REST API and an API token; HTTPS with a
  self-signed certificate on request. "Today" follows the time zone of Gladys
  and changes right after midnight.
- Scene actions: add an item to a shopping list (never twice), check an item,
  add a recipe to the meal plan (by name, or a random one picked by Mealie),
  get the meals of a day and get a shopping list, for a message.
- Dashboard widgets (Gladys 5.2.0 or later): the meal plan of today or of the
  next seven days, with a Plan button and its form; a shopping list, with Add
  and Check buttons and their forms; Refresh, and Open Mealie for an HTTPS
  Mealie.
- A Test the connection button, a connection status that names the problem,
  and a transport badge on the device.
- Every text in English, French, German and Spanish, and the documentation in
  the four languages.

[Unreleased]: https://github.com/guim31/gladys-mealie/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-mealie/releases/tag/v1.0.1
