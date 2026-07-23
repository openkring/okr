# Instruments (grid board) feature

The consumer feature over the shared board primitive (spec §2.24). One `InstrumentModel` /
`instruments` collection serves all four grid instruments — **SWOT, PESTEL, BMC, Eisenhower** —
discriminated by `type`. There is no per-type feature: a "consumer" is a `GridDefinition`
(`@okr/instruments-util`) + a route + i18n cell labels + menus.

## Firestore Collection

`instruments` — `InstrumentModel` with an embedded `topics[]` array. A board mutation (drag / add /
edit / delete a card) writes the whole `topics` array via `InstrumentService.saveTopics` (silent, no
toast); instrument metadata (name/description) goes through the normal `create`/`update`.

## Field semantics

| Field | Meaning |
|---|---|
| `type` | selects the `GridDefinition` and the list partition (`swot`/`pestel`/`bmc`/`eisenhower`) |
| `topics[].cell` | the `GridCell.id` the card sits in |
| `topics[].rank` | fractional rank within the cell (assigned on create; a move rewrites only `{cell, rank}`) |
| `topics[].score` | typed `{impact, horizon}` (SWOT weighting / PESTEL impact+horizon; 0 = unset) |
| `topics[].sourceType`/`sourceKey` | polymorphic link to a Task/Objective/Risk (OQ-3) — rendered as a source chip |

## Store

`InstrumentStore` (component-provided by `InstrumentList` and `InstrumentPage`). Loads instruments
filtered by `type`; on the board page loads one instrument by key. Board methods: `addTopic`,
`moveTopic`, `editTopic`, `deleteTopic` (all through `saveTopics`); instrument methods: `add`,
`edit`, `delete`. Resolves cell labels via the store-driven i18n pattern (`cellLabels`).

## Components

- `InstrumentList` — per-type list; tap → board page; FAB to add.
- `InstrumentPage` — the board detail (`okr-instrument-board` from `@okr/instruments-ui`).
- `InstrumentEditModal` — instrument metadata (name/description).
- `TopicEditModal` — the card editor (label/description/score); can delete.

## Library path

`libs/instruments/feature` — `@okr/instruments-feature`.

## Routes

- `instruments/:listId/:contextMenuName` → `InstrumentList` (`listId` = the type)
- `instruments/board/:instrumentKey` → `InstrumentPage`

## Not yet implemented (spec §2.24 remaining)

PNG/PDF export; the CMS `instrument` section; the source-link **picker** in the topic editor
(rendering the link is done, choosing one is not); cross-instrument auto-flow (PESTEL → SWOT O/T).
