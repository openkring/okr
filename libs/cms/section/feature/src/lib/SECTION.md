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
| `button` | `ButtonConfig` | Styled action button (navigate, download, external link) |
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
| `hero` | `HeroConfig` | Full-width hero image with logo overlay |
| `iframe` | `IframeConfig` | Embedded external web page |
| `invitations` | `InvitationsConfig` | Event invitations for the current user |
| `links` | `LinksConfig` | Curated list of external links with logo/description |
| `map` | `MapConfig` | Leaflet / Google Maps embed with configurable center/zoom |
| `messages` | `MessagesConfig` | Latest Matrix chat messages for the current user |
| `news` | `NewsConfig` | Links to latest blog articles |
| `orgchart` | `OrgchartConfig` | Interactive organization chart starting from a root group |
| `people` | `PeopleConfig` | Persons (explicit list, group members or role holders) as cards, grid or 1–4 slider lines; imgix portraits (size, radius, facearea crop, b/w, background removal + colour); name, function, email above/below/beside/over the picture |
| `rag` | `RagConfig` | Retrieval-augmented generation chat interface |
| `slider` | `SliderConfig` | Image slider / carousel |
| `table` | `TableConfig` | HTML-rendered data table with styled header/body |
| `tasks` | `TasksConfig` | Task list for the current user |
| `tracker` | `TrackerConfig` | GPS location tracker with configurable interval |
| `video` | `VideoConfig` | Embedded video (YouTube or other iframe) |

## Article Blocks

Spec 1.173, `planning/specs/2026-11-23-article-blocks-design.md`. An article may hold its content as blocks:

| Field | Type | Description |
|---|---|---|
| `properties.blocks` | `ArticleBlock[]` | The content in order: `text`, `image`, `gallery`, `button`, `columns`, `callout`, `divider`, `space`; `columns` hold only text, image and button. Absent = an old article |
| `properties.cover` | ImageConfig | Teaser picture (news, lists); never drawn in the article itself |

- **Old article** (no `blocks`): the text is in `content`, the images in `properties.images`.
- **Classic article**: `blocks` in a shape the old fields can express (e.g. image above text). It is converted back and drawn by the template of `ArticleSectionComponent`, unchanged.
- **Free article** (`isFreeArticle`): anything else. It is drawn by `okr-article-blocks` (`ArticleBlocks`), loaded with `@defer`; until then, or when it cannot be loaded, header, text, images and the first button are shown. What cannot be drawn (empty, malformed, unknown type) is left out by `articleBlockViews`.
- The header stands above the blocks. Two exceptions, decided by the first block that is drawn (`articleHeaderPlace`): a slideshow carries title and subtitle on its images; with an own `background`, columns of one image and one text carry the header in the text column.

**Reading an article:** with blocks, the old fields are empty or out of date. Every reader of the text or the images goes through `withClassicFields(section)` (the old fields filled from the blocks; the same object for an old article), or `articleCover` for the teaser picture — all in `@okr/shared-models`. `node scripts/check-article-readers.mjs` fails for a file that reads the text without it; its header names what it does not see.

## Article Editor

Spec 1.175, `planning/specs/2026-11-23-article-block-editor-design.md`. `ArticleEditorModal` (full screen) edits an article as blocks: the article itself in a canvas, the settings of the selected block at the side.

**When it opens:** `SectionStore.edit()` and `PageIntegrityStore` (`editSection`, `createMissingSection`) ask `usesArticleEditor(section, readOnly, gateOpen)`: an article that is not read-only, has no `journalKey`, and the gate is open or the article already has blocks. Everything else opens `SectionEditModal` as before (also the travel journal and mail pages). Both use `openArticleEditor()`; it loads the modal with `import()`, the editor saves by itself. It answers when the window is shown, with `closed`, the promise of the key with which the caller reloads; a failed opening is told by it and answers nothing.

| Part | Where | What |
| --- | --- | --- |
| `article-editor.loader.ts` | feature | `openArticleEditor()`, the only entry; light, in the chunk of readers |
| `article-editor.modal.ts`, `article-editor-modal.util.ts` | feature | Window: history, devices, saving, questions; its rules are in the util |
| `article-canvas.ts`, `article-canvas-block.ts`, `article-canvas.util.ts` | feature | Canvas: selecting, keyboard, dragging, text in place |
| `article-frame.ts`, `article-block.ts` | feature | Card and header, one block: drawn once, for readers and canvas. Whoever draws the frame adds `ARTICLE_FRAME_STYLES` (and `ARTICLE_COLUMNS_STYLES`) to its own styles |
| `article-block-panel.ts`, `article-panel.ts`, `article-block-library.ts`, `article-image-pick.modal.ts` | ui | Side panel. They hold no form: the modal runs `articleSectionValidations` once and passes the errors |
| `article-editor*.util.ts`, `article-panel.util.ts` | util | Pure operations: blocks, history (100 steps, typing run 1 s), opening, comparing, translations, errors |
| `okr-rich-text-inline` | `shared-ui-editor` | One text edited in place, toolbar outside |
| `ArticleBlocksGate`, `ArticleSaveService` | data-access | Gate and save, see below |

**Keep readers light.** The editor, ProseMirror and `article-editor-i18n.ts` are in chunks that only the editor loads. Export none of `article-editor.modal`, `article-canvas*` from the feature barrel, and import `article-editor-open.util`, `article-editor-history.util` and the panels only from editor files. What readers' stores need is in `article-editor-entry.util.ts`. Check with a production build (`lazy-loading` skill); the probe of `scripts/bundle-closure.mjs` matches packages and folders, not file names, so look for the files in the source maps.

**Gate** (`ArticleBlocksGate`): blocks may be stored only when the global `app-version.minVersion` is at least `ARTICLE_BLOCKS_MIN_VERSION` (`version` skill). It is `undefined` until the owner's release step, so the gate is closed. `open` / `load()`: the editor may open. `mayWrite` / `loadMayWrite()`: blocks may be stored; code that creates articles uses only this one, through `articlesToWrite()`.

**Trial mode** (development builds only): `localStorage.setItem('okr.articleEditor', 'trial')` and reload. The editor opens although the gate is closed, shows a notice, and a save writes nothing (`{ status: 'saved', trial: true }`; never store that key). Uploads are off. `mayWrite` stays false. Remember that a development app reads the production database; everything outside the editor writes as usual.

**Saving** (`ArticleSaveService.save`): reads, compares and writes in one transaction (`SectionService.saveChecked`, `FirestoreService.writeChecked`). Results: `saved`, `conflict` (somebody else changed it), `gone`, `offline`, `failed`. The window stays open until it is saved. The old fields (`content`, `properties.images` …) are left as they are.

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
| `ArticleBlocks` | `okr-article-blocks` | The blocks of a free article (lazy, not exported) |
| `ArticleBlockComponent` | `okr-article-block` | One block, except columns; for readers and canvas (not exported) |
| `ArticleFrame` | `okr-article-frame` | Card, banner, colour and header of an article (not exported) |
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
