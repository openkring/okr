# Section Domain

## Overview

Sections are the content building blocks rendered inside Pages. Each section has a `type` that determines both its data shape and which component renders it. The `SectionDispatcher` (`bk-section-dispatcher`) receives a `SectionModel` and switches on `section.type` to render the correct section component. Role-based visibility is enforced at the dispatcher level via `roleNeeded`.

A section stores its type-specific configuration in the `properties` field. The base fields (`title`, `subTitle`, `content`, `color`, etc.) are shared across all section types; `properties` is a discriminated union typed per section.

## Firestore Collection

Collection name: `sections`

## Base Section Fields

| Field | Type | Description |
|---|---|---|
| `okey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `type` | SectionType | Determines rendering component and `properties` shape |
| `state` | string | Content state (`draft`, `inReview`, `published`, `cancelled`, etc.) |
| `name` | string | Internal name |
| `title` | string | Visible section title |
| `subTitle` | string | Visible section subtitle |
| `index` | string | Search index string |
| `color` | ColorIonic | Ionic color token for the section card |
| `colSize` | string | Responsive col-size config (e.g. `12` or `12,6,4` for default/md/lg) |
| `roleNeeded` | RoleName | Minimum role required to see this section |
| `content` | EditorConfig | Rich-text HTML content with column layout config |
| `properties` | (see Section Types) | Type-specific configuration object |
| `notes` | string | Internal notes |
| `tags` | string | Comma-separated tags for filtering |

### EditorConfig

| Field | Type | Description |
|---|---|---|
| `htmlContent` | string | HTML from the rich-text editor |
| `colSize` | number | MD column width of the first column (1–6) |
| `position` | ViewPosition | Image/content position relative to text |

## Section Types

| Type | Config Interface | Description |
|---|---|---|
| `accordion` | `AccordionConfig` | Collapsible accordion; items reference other section keys |
| `activities` | `ActivitiesConfig` | List of latest system activity events |
| `album` | `AlbumConfig` | Photo/video gallery from Firebase Storage directory |
| `article` | `ArticleConfig` | Rich-text article with optional images, or a list of blocks (see Article Blocks) |
| `button` | `ButtonConfig` | «Aktions-Button»: download, zoom, form/reservation, workflow, contract, contract document, emergency alarm; edited in the button editor (see Button Editor) |
| `cal` | `CalendarOptions` | Full-calendar view (FullCalendar options) |
| `chart` | `EChartsOption` | Apache ECharts chart |
| `chat` | `ChatConfig` | Matrix chat channel |
| `contact` | `ContactConfig` | «So findest du uns»: one organization + one contact person (logo/avatar, name, address, email, phone read live from the `address-directory` projection), optional Google map of the org address and contact form (opens a prefilled mail, stores nothing); title, subtitle and every block are placed by drag and drop into 1–6 rows of 1–3 columns (fr widths), presets classic/split/cards/formFocus/stacked; rows stack below 640px section width (container query) |
| `counter` | `CounterConfig` | Number counted up/down by hand or automatically; four looks (display, stepper, flip, ring); local to the viewer, not persisted |
| `footer` | `FooterConfig` | Page footer: 1–3 columns of titles, texts, links, icons and logos, plus an optional bottom line; columns sit side by side on wide sections and stack below 576px (container queries); also rendered on the public website |
| `emergency` | — | Emergency notice section |
| `energy` | `EnergyConfig` | Energy figures of one municipality: key figures, trends, tariffs, comparison (read-only, from `energy-figures`) |
| `events` | `EventsConfig` | Upcoming / past calendar event list |
| `files` | `FilesConfig` | Curated document file list |
| `hero` | `HeroConfig` | Full-width hero image with logo overlay; edited in the hero editor (see Hero Editor) |
| `iframe` | `IframeConfig` | Embedded page on the embed allowlist (OpenStreetMap, YouTube, Vimeo); `height` S / M / L / full (absent = from a legacy `style`, else M) |
| `invitations` | `InvitationsConfig` | Event invitations for the current user |
| `links` | `LinksConfig` | Curated list of external links with logo/description |
| `map` | `MapConfig` | Leaflet / Google Maps embed with configurable center/zoom |
| `messages` | `MessagesConfig` | Latest Matrix chat messages for the current user |
| `news` | `NewsConfig` | Links to latest blog articles |
| `orgchart` | `OrgchartConfig` | Interactive organization chart starting from a root group |
| `people` | `PeopleConfig` | Persons (explicit list, group members or role holders) as cards, grid or 1–4 slider lines; imgix portraits (size, radius, facearea crop, b/w, background removal + colour); name, function, email above/below/beside/over the picture |
| `rag` | `RagConfig` | Retrieval-augmented generation chat interface |
| `slider` | `SliderConfig` | Image slider / carousel. Retired (spec 1.182): a new «Slider» and a stored one open in the article editor as an article with one gallery block (`sliderToArticle`, `asEditedSection`); one save converts it. Still drawn until the migration |
| `table` | `TableConfig` | HTML table with an optional header row; stacks or scrolls in a narrow container; edited in the table editor (see Table Editor) |
| `tasks` | `TasksConfig` | Task list for the current user |
| `tracker` | `TrackerConfig` | GPS location tracker with configurable interval |
| `video` | `VideoConfig` | YouTube or Vimeo player, or an album video; `aspectRatio` (absent = 16:9) |

## Article Blocks

Spec 1.173, `planning/specs/2026-11-23-article-blocks-design.md`. An article may hold its content as blocks:

| Field | Type | Description |
|---|---|---|
| `properties.blocks` | `ArticleBlock[]` | The content in order: `text`, `image`, `gallery`, `button`, `columns`, `callout`, `divider`, `space`; `columns` hold only text, image and button. Absent = an old article |
| `properties.cover` | ImageConfig | Teaser picture (news, lists); never drawn in the article itself |

- **Old article** (no `blocks`): the text is in `content`, the images in `properties.images`.
- **Classic article**: `blocks` in a shape the old fields can express (e.g. image above text). It is converted back and drawn by the template of `ArticleSectionComponent`, unchanged.
- **Free article** (`isFreeArticle`): anything else. It is drawn by `okr-article-blocks` (`ArticleBlocks` of `@okr/cms-article-feature`), created with `loadArticleBlocks()`; until then, or when it cannot be loaded, header, text, images and the first button are shown. What cannot be drawn (empty, malformed, unknown type) is left out by `articleBlockViews`.
- The header stands above the blocks. Two exceptions, decided by the first block that is drawn (`articleHeaderPlace`): a slideshow carries title and subtitle on its images; with an own `background`, columns of one image and one text carry the header in the text column.

**Reading an article:** with blocks, the old fields are empty or out of date. Every reader of the text or the images goes through `withClassicFields(section)` (the old fields filled from the blocks; the same object for an old article), or `articleCover` for the teaser picture — all in `@okr/shared-models`. `node scripts/check-article-readers.mjs` fails for a file that reads the text without it; its header names what it does not see.

## Article Editor

Spec 1.175, `planning/specs/2026-11-23-article-block-editor-design.md`. `ArticleEditorModal` (full screen) edits an article as blocks: the article itself in a canvas, the settings of the selected block at the side.

**When it opens:** `SectionStore.edit()` and `PageIntegrityStore` (`editSection`, `createMissingSection`) ask `usesArticleEditor(section, readOnly, gateOpen)`: an article that is not read-only, has no `journalKey`, and the gate is open or the article already has blocks. Everything else opens `SectionEditModal` as before (also the travel journal). Mail pages are written in the composer since 1.176, not here. Both use `openArticleEditor()`; it loads the modal with `import()`, the editor saves by itself. It answers when the window is shown, with `closed`, the promise of the key with which the caller reloads; a failed opening is told by it and answers nothing.

| Part | Where | What |
| --- | --- | --- |
| `article-editor.loader.ts` | feature | `openArticleEditor()`, the only entry; light, in the chunk of readers |
| `article-editor.modal.ts`, `article-editor-modal.util.ts` | feature | Window of an article: history, saving, questions, notices; its rules are in the util |
| `article-editor-surface.ts`, `article-editor-surface.util.ts` | `cms-article-feature` | The editor without its window: toolbar row, canvas, panel, undo and redo, selection, caret. For the window of an article and the composer of a mail; its contract is in the class comment |
| `editor-profile.ts` | util | What differs between the two hosts (`ARTICLE_PROFILE`, `MAIL_PROFILE`): block types, devices, widths, tones, fields of the panel |
| `article-canvas.ts`, `article-canvas-block.ts`, `article-canvas.util.ts` | `cms-article-feature` | Canvas: selecting, keyboard, dragging, text in place |
| `article-frame.ts`, `article-block.ts` | `cms-article-feature` | Card and header, one block: drawn once, for readers and canvas. Whoever draws the frame adds `ARTICLE_FRAME_STYLES` to its own styles; `ARTICLE_COLUMNS_STYLES` is for files inside the lib only, it is not exported |
| `mail-gallery.ts`, `mail-events.ts`, `mail-panel.util.ts` | `cms-article-feature`, util | What only a mail draws (spec 1.176 §8.2); the rules are those of `render-mail-blocks.logic.ts` (functions) |
| `mail-editor-host.ts`, `mail-editor.loader.ts` | `cms-article-feature` | The editor of a Versand mail (spec 1.176 §8.1): the surface with `MAIL_PROFILE` in the composer's «Editor» segment. The composer (`pdf-template-ui`, which may not import this lib) gets `loadMailEditor` from `bulk-email.ts` as an input and creates the host with `createComponent`; the draft (`MailPageDraft`) and the context (`MailEditorContext`, `cms-section-util`) are its inputs |
| `mail-article-pick.modal.ts` | `cms-article-feature` | «Artikel einfügen»: a picker (no form), loaded by a relative `import()` from the host; blocks by `mailBlocksFromArticle` / `teaserBlocks` (util) |
| `article-block-panel.ts`, `article-panel.ts`, `article-block-library.ts`, `article-image-pick.modal.ts` | ui | Side panel. They hold no form: the modal runs `articleSectionValidations` once and passes the errors |
| `article-editor*.util.ts`, `article-panel.util.ts` | util | Pure operations: blocks, history (100 steps, typing run 1 s), opening, comparing, translations, errors |
| `okr-rich-text-inline` | `shared-ui-editor` | One text edited in place, toolbar outside |
| `ArticleBlocksGate`, `ArticleSaveService` | data-access | Gate and save, see below |

**Keep readers light.** The editor, ProseMirror and `article-editor-i18n.ts` are in chunks that only the editor loads. Do not export `article-editor.modal` from the feature barrel, import `ArticleEditorSurface`, `ArticleCanvas` and `article-editor-open.util`, `article-editor-history.util` and the panels only from editor files. What readers' stores need is in `article-editor-entry.util.ts`. Check with a production build (`lazy-loading` skill); the probe of `scripts/bundle-closure.mjs` matches packages and folders, not file names, so look for the files in the source maps. The barrel of `@okr/cms-article-feature` exports the canvas beside the parts readers load at once; its `index.ts` says what must never be done with it: only `export *` and `export type` in it, never an `import()` of it, lazy parts through a loader function (`loadArticleBlocks`, `loadMailEditor`). ESLint refuses the rest, and `check-article-readers` (release gate) refuses an `import()` of the barrel, a value re-export and any other statement in it (`lazy-loading` skill).

**Gate** (`ArticleBlocksGate`): blocks may be stored only when the global `app-version.minVersion` is at least `ARTICLE_BLOCKS_MIN_VERSION` (`version` skill). Since 7.63.0 it is `7.63.0`; the gate stays closed while `minVersion` is lower. `open` / `load()`: the editor may open. `mayWrite` / `loadMayWrite()`: blocks may be stored; code that creates articles uses only this one, through `articlesToWrite()`.

**Trial mode** (development builds only): `localStorage.setItem('okr.articleEditor', 'trial')` and reload. The editor opens although the gate is closed, shows a notice, and a save writes nothing (`{ status: 'saved', trial: true }`; never store that key). Uploads are off. `mayWrite` stays false. Remember that a development app reads the production database; everything outside the editor writes as usual.

**Saving** (`ArticleSaveService.save`): reads, compares and writes in one transaction (`SectionService.saveChecked`, `FirestoreService.writeChecked`). Results: `saved`, `conflict` (somebody else changed it), `gone`, `offline`, `failed`. The window stays open until it is saved. The old fields (`content`, `properties.images` …) are left as they are.

## Button Editor

A button section that may be changed is edited graphically, as an article is: `SectionEditModal` shows `ButtonEditor` (feature) in place of the form when the section is a `button`, not read-only and not in the travel journal. The modal keeps the change confirmation and the save; the editor edits its `formData`.

| Part | Where | What |
| --- | --- | --- |
| `button-editor.ts` | feature | Toolbar (devices, undo, redo, text tools), canvas, panel. Title, subtitle and intro are typed in place with `okr-article-header-edit` (`cms-article-feature`), the text with `okr-rich-text-inline`. Runs `buttonSectionValidations` once; its own undo history (`record` / `undo` / `redo`); a reset by the modal is a step |
| `section-configuration.ts` (`part="appearance"`) | ui | The section's own settings, shared by every section type: who sees it, state, width, name and (once there is an intro) where it stands. A change here applies to the article and the button editor |
| `button-panel.ts` | ui | The button, shown while it is selected: what it does first (choice cards, `buttonActionChoices`), then label, alt text, look (presets), size, icon, layout next to the text. «Anpassen» opens the former `okr-button-config` field by field |
| `button-presets.util.ts` | util | Presets `main`, `outline`, `link`, `round`, `emergency`; sizes S/M/L/whole width; icon none/left/right/only. Each writes the stored `ButtonStyle` / `IconConfig` fields, so readers and older apps draw as before; stored values that match no preset show none as chosen |
| `button-editor-i18n.ts` | util | `BUTTON_EDITOR_I18N_KEYS` (`button.editor.*`); resolved with the section and article editor keys as `ButtonEditorI18n` |

**Download button (the default).** Most buttons offer a PDF, so `createSection('button')` makes one (`downloadButtonConfig`): look `link` (no fill, written as it is, not in capitals), size M, the PDF icon (`filetypes:pdf`) in front, label «PDF herunterladen», action Download, button above the text. With the Download action the panel offers «Datei hochladen»: `SectionStore.uploadButtonFile` picks and uploads the file (`tenant/<tid>/section/<okey or new-…>/file/…`) and records it as a document; `withUploadedFile` writes its address into the form (alt text = file name unless one is there; a file that is no PDF loses the PDF icon and the default label). The section is saved with the change confirmation as for any other change. The address of a file already online can be typed instead.

**Emergency button.** Since `ButtonAction.Emergency` (appended to the stored numeric enum) it is an ordinary button section: preset `emergency` = round, solid, `danger`, 76 px across (about 2 cm), label «Hilfe !», no icon; a press calls `SectionStore.sendEmergencyMessage()`. Since a press sends name, phone number and location, `ButtonWidget` always draws a button with this action in that look (`withFixedEmergencyLook`), whatever its stored style: it can never pass for a harmless button. The former `EmergencyButtonWidget` is gone. A document stored before still carries the name `emergency-button` and another action: `withLegacyEmergency` shows it as the emergency button (button above the text) until it is patched with `emergencyButtonConfig`.

## Hero Editor

A hero section that may be changed is edited graphically, as a button is: `SectionEditModal` shows `HeroEditor` (feature) in place of the form when the section is a `hero`, not read-only and not in the travel journal (there the cover comes from the footprint and the overlay is set, so the form stays). The modal keeps the change confirmation and the save; the editor edits its `formData`.

| Part | Where | What |
| --- | --- | --- |
| `hero-editor.ts` | feature | Toolbar (devices, undo, redo), canvas, panel. The canvas draws the hero as readers see it (height, focus, cover or gradient band, white card). Title, subtitle and intro are typed in place with `okrPlainEditable` (`cms-article-feature`). A click on the background selects the cover, on the logo the logo, on a button that button; «+ Logo» and «+ Button» add them. Runs `heroSectionValidations` once; its own undo history; a reset by the modal is a step |
| `section-configuration.ts` (`part="appearance"`) | ui | The section's own settings, shared by the article, button and hero editors |
| `hero-panel.ts` | ui | One part of the hero: **cover** (image, height S/M/L/whole screen, focus, the gradient only while there is no image; pixel height and imgix parameters behind «Für Fortgeschrittene»), **logo** (image, size, shape; width, border and radius behind «Anpassen»), **button** (label, link, look, remove) |
| `hero-presets.util.ts` | util | Height choices, logo sizes (80/150/240 px → `imageStyle.width`) and shapes (0/12px/50% → `imageStyle.borderRadius`), adding, changing, moving and removing buttons. Each writes the stored `HeroConfig` fields, so readers, the website and older apps draw as before; a stored value that matches no choice shows none as chosen |
| `hero-editor-i18n.ts` | util | `HERO_EDITOR_I18N_KEYS` (`hero.editor.*`); resolved with the section and article editor keys as `HeroEditorI18n`. Heights, focus, gradient and button fields keep their `hero.*` / `cta.*` texts |

The former cards (`okr-hero-config`, `okr-hero-logo-config`, `okr-cta-config`) remain for the read-only view and the travel journal.

## Video Editor

A video section that may be changed is edited graphically too: `SectionEditModal` shows `VideoEditor` (feature) when the section is a `video`, not read-only and not in the travel journal (which keeps the form: it picks clips).

| Part | Where | What |
| --- | --- | --- |
| `video-editor.ts` | feature | Toolbar (devices, undo, redo), canvas, panel, as `ButtonEditor`. Header typed in place; the video drawn by `okr-video-section` under a cover that takes the click (gone while the video is selected, so the player can be tried). A new section opens with the video selected |
| `video-panel.ts` | ui | One field for the link as copied (YouTube, Vimeo, an album video link or key) with «… erkannt», and the format (16:9, 4:3, 1:1, 9:16). Also the read-only view in `SectionForm` |
| `video-source.util.ts` | util | `parseVideoSource` (pasted text → `youtube` / `vimeo` / `album`), `applyVideoSource` (writes `baseUrl` + `url` or `documentKey`), `videoSourceOf`, `videoSourceLink`, `videoAspectRatioCss` |
| `video-editor-i18n.ts` | util | `VIDEO_EDITOR_I18N_KEYS` (`video.editor.*`); the panel's own keys (`video.link.*`, `video.ratio.*`) are in `SECTION_I18N_KEYS` |

YouTube is embedded from `youtube-nocookie.com`. `width`, `height` and `frameborder` are gone from `VideoConfig` (2026-11-27): the player fills the width, its height follows `aspectRatio`, a tall video is at most 80 % of the window high.

## Table Editor

A table section that may be changed is edited graphically too: `SectionEditModal` shows `TableEditor` (feature) when the section is a `table`, not read-only and not in the travel journal (`isTableEditor()`). The modal keeps the change confirmation and the save.

| Part | Where | What |
| --- | --- | --- |
| `table-editor.ts` | feature | Toolbar (devices, undo, redo, text tools, «Aus Excel einfügen»), canvas, panel. Each cell is typed in place with `okr-rich-text-inline`, one at a time; a chosen cell shows the row and column tools; Tab moves on and adds a row past the last cell. A paste of several cells (Excel, Numbers, Google Sheets) is caught in the capture phase and fills the table from the chosen cell, adding rows and columns |
| `table-view.ts` | ui | Draws the table for readers and for the canvas (with a cell template). Flexible column widths; below the breakpoint of its container (container query, not the screen) it stacks or scrolls with the first column pinned |
| `table-panel.ts` | ui | Look (lines, plain, coloured), header row, where the title stands, text size, columns (width, alignment), «Auf kleinen Bildschirmen» (auto, stack, scroll; phone or tablet). «Anpassen» opens the former style fields and the template |
| `table-layout.util.ts` | util | Stored table ↔ header, rows, columns (`tableContentOf`, `withTableContent`); row and column operations; looks and sizes; `parseClipboardTable` (tab-separated, quoted cells as Excel writes them) |
| `table-editor-i18n.ts` | util | `TABLE_EDITOR_I18N_KEYS` (`table.editor.*`); resolved with the section and article editor keys as `TableEditorI18n` |

**Stored as before.** `data.header` / `data.body` (row by row) and `grid.template` stay what readers and older apps draw: the editor writes the template from `columns` (Schmal = `100px`, Breit = `300px`). `columns` and `responsive` are optional additions; a table without `responsive` is `auto` below the phone width: up to two columns stack, wider tables scroll. `grid.gap`, `grid.padding` and `grid.backgroundColor` are not drawn and no longer offered. An empty stored style value draws none; only a missing one takes the default.

## Iframe Editor

An iframe section that may be changed is edited graphically too: `SectionEditModal` shows `IframeEditor` (feature) when the section is an `iframe`, not read-only and not in the travel journal.

| Part | Where | What |
| --- | --- | --- |
| `iframe-editor.ts` | feature | Toolbar, canvas and panel as `VideoEditor`. Header typed in place; the page drawn by `okr-iframe-section` under a cover that takes the click. A page off the embed allowlist is a placeholder that says so. A new section opens with the page selected |
| `iframe-panel.ts` | ui | One field for a link or a whole embed code (`<iframe src="…">`), with «… erkannt» or why the app cannot show it, and the height (S 300px, M 400px, L 600px, full 80vh). Also the read-only view in `SectionForm` |
| `iframe-source.util.ts` | util | `parseIframeSource` (pasted text → url, host, allowed), `iframeHeightOf` / `iframeHeightCss`, `cleanIframeConfig` (drops a legacy `style`) |
| `iframe-editor-i18n.ts` | util | `IFRAME_EDITOR_I18N_KEYS` (`iframe.editor.*`); the panel's own keys (`iframe.link.*`, `iframe.found.*`, `iframe.height.*`) are in `SECTION_I18N_KEYS` |

The free CSS `style` is gone from `IframeConfig` (2026-11-27): the page fills the width without a border, its height is one of four choices. A section stored before has no `height`: its height is the choice nearest to its style's `height` / `min-height`. Saving it writes `height`; the old `style` field stays in Firestore (`updateModel` merges) but is no longer read. The website never published `style`. The app shows only pages on the embed allowlist (`getSafeEmbedUrl`, `frame-src` in `firebase.json`); the suite rejects any other host.

## Section Dispatcher

`SectionDispatcher` (`bk-section-dispatcher`) is a pure presentational switch-component. It receives:

- `section` — the `SectionModel` to render (required)
- `currentUser` — used for `hasRole()` check against `roleNeeded`
- `editMode` — passed down to section components that support inline editing

Heavy sections (`cal`, `chart`, `slider`, `orgchart`) use Angular `@defer` to lazy-load on viewport or idle. Sections that do not match any known type fall back to `MissingSectionComponent`.

## State (SectionStore)

The `SectionStore` (NgRx Signal Store, `providedIn: 'root'`) holds:

- `sectionId` — key of a single section being viewed/edited
- `searchTerm`, `selSearchTerm`, `selectedTag`, `selectedCategory`, `selectedState` — list and selection-modal filters
- `sectionsResource` — live Firestore stream of all sections (for admin list and select modal)
- `sectionResource` — live Firestore stream for a single section

Notable store actions:

- `add()` — presents a card-select modal to choose a section type, then opens the edit modal
- `edit()` — opens the article editor (see Article Editor) or `SectionEditModalComponent`; the form creates or updates on confirm
- `delete()` — confirmation-guarded deletion
- `uploadImage(section)` — picks a file, uploads to Firebase Storage at `tenant/<tid>/section/<id>/image/<name>`, updates the section's `properties.images` array (not for an article with blocks), and creates a `DocumentModel`
- `uploadFile(section)` — same flow for button-section file downloads
- `send(section)` — opens `MessageCenterModal` then calls the `sendEmail` Cloud Function (`europe-west6`)

## Key Components

| Component | Selector | Role |
|---|---|---|
| `SectionDispatcher` | `bk-section-dispatcher` | Type switch; renders the correct section component |
| `SectionListComponent` | (admin) | Admin list with search/type/state/tag filters |
| `SectionSelectModalComponent` | (modal) | Select an existing section to add to a page |
| `SectionEditModalComponent` | (modal, full) | Full-screen edit modal for any section type |
| `ArticleSectionComponent` | `bk-article-section` | Rich-text + images |
| `ArticleBlocks` | `okr-article-blocks` | The blocks of a free article (`cms-article-feature`; lazy, `loadArticleBlocks()`) |
| `ArticleBlockComponent` | `okr-article-block` | One block, except columns; for readers and canvas (`cms-article-feature`, not exported) |
| `ArticleFrame` | `okr-article-frame` | Card, banner, colour and header of an article (`cms-article-feature`) |
| `ArticleEditorModal` | `okr-article-editor-modal` | Block editor (lazy, not exported; open it with `openArticleEditor`) |
| `AlbumSectionComponent` | `bk-album-section` | Photo/video gallery |
| `CalendarSectionComponent` | `bk-calendar-section` | FullCalendar |
| `OrgchartSectionComponent` | `bk-orgchart-section` | Organization chart |
| `PeopleSectionComponent` | `okr-people-section` | Card header (title/subtitle) + list name + `okr-persons-widget` |
| `EventsSectionComponent` | `bk-events-section` | Event list |
| `NewsSectionComponent` | `bk-news-section` | Blog news list |
| `RagSectionComponent` | `bk-rag-section` | RAG chat interface |

## Data Access

`SectionService` (`@okr/cms-section-data-access`) is the Firestore gateway:

- `list()` — real-time stream of all sections for the tenant
- `read(id)` — real-time stream for a single section
- `searchByKeys(keys)` — one-time fetch of multiple sections by key (used by `PageSortModal`)
- `create / update / delete` — write operations
- `saveChecked` — reads, compares and writes in one transaction (article editor)

## Content State Visibility

In `ContentPage`, only sections with `state === 'published'` are shown to non-admin users. `contentAdmin` users see all states; section borders are colour-coded by state in edit mode.
