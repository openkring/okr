# vcard-feature

Client side of the vCard export feature (spec 17):

- `VcardExportService` — the single entry point person/org stores call. Resolves
  the caller's capability, gathers data availability, opens the scope modal
  (tier 2), invokes the `vcardExport` callable and triggers the `.vcf` download.
- `VcardExportScopeModal` — data-driven scope picker (a toggle per available
  category).
