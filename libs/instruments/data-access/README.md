# instruments-data-access

`InstrumentService` — the Firestore gateway for the `instruments` collection (spec §2.24). CRUD plus
`saveTopics` (the silent embedded-array write behind a board drag/add/edit/delete) and `listByType`
(the per-type list partition).
