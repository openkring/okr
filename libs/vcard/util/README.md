# vcard-util

Pure, framework-free helpers for the vCard export feature (spec 17):

- `resolveVcardCapability` — role → what the caller may export.
- `buildVCard` — emits a vCard 3.0 card (Apple Contacts compatible) from an
  assembled, model-decoupled `VcardRecord`.
- `toAppleRelationLabel` — maps a relation kind to Apple's predefined label.
- shared request/response/scope types.

Consumed both by the `vcardExport` Cloud Function (server-side assembly) and the
`@bk2/vcard-feature` client lib so the encoding stays byte-identical.
