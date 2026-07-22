# instruments-ui

The shared board-primitive renderer (spec §2.24): `okr-instrument-board`, a dumb component that
draws a declarative `GridDefinition` (with cell spanning) as a CSS Grid of rank-ordered CDK drop
lists and emits move/select/add intents. No store, no Firestore. Seeded from the Kanban `TaskBoard`.
