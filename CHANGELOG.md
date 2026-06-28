# Changelog

All notable changes to `@imakeinternet/door-sdk` are documented here. This project adheres
to [Semantic Versioning](https://semver.org/). The package version is independent
of `HOST_API_VERSION` (the Host API contract a door targets).

## [0.3.0] — 2026-06-28

Publishing to a catalog.

### Added
- `bbs-door publish <path>` — packs the door and uploads it to a catalog with a
  bearer token (`--registry <url>` and `--token`, or `BBS_CATALOG_TOKEN`). The
  token is never printed. Optional `--changelog`.

## [0.2.0] — 2026-06-27

Door packaging + store readiness.

### Added
- `HOST_API_VERSION` export — the Host API major a door targets, declared in
  `door.json` as `apiVersion`. The board's runtime refuses an incompatible major
  cleanly instead of crashing mid-game.
- `door.json` manifest v2 fields: `version`, `apiVersion`, `description`,
  `category`, `tags`, `license`, `homepage` (all additive; older manifests still
  load). A documented `door.schema.json` and a `DoorManifest` type.
- `bbs-door validate <path>` — checks the manifest and that the entry exists and
  parses. `--publish` additionally requires `version` + `apiVersion`.
- `bbs-door pack <path>` — builds a distributable `<slug>-<version>.door` archive
  (gzipped tar of the door's files) and prints its sha256.
- `LICENSE`, this changelog, `engines.node`, and an `examples/` folder.

### Changed
- `bbs-door new` scaffolds a complete v2 `door.json`.

## [0.1.0] — 2026-06-27

Initial SDK + CLI: the `door()` helper, TypeScript types for the Host API, and
`bbs-door dev` / `bbs-door new`.
