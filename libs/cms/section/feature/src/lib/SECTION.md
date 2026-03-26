# Section Domain

## Overview
Sections are the content building blocks rendered inside Pages. Each section has a `type` that determines both its data shape and which component renders it. The `SectionDispatcher` (`bk-section-dispatcher`) receives a `SectionModel` and switches on `section.type` to render the correct section component. Role-based visibility is enforced at the dispatcher level via `roleNeeded`.

A section stores its type-specific configuration in the `properties` field. The base fields (`title`, `subTitle`, `content`, `color`, etc.) are shared across all section types; `properties` is a discriminated union typed per section.

## Firestore Collection
Collection name: `sections`

## Base Section Fields
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
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
| `article` | `ArticleConfig` | Rich-text article with optional images |
| `button` | `ButtonConfig` | Styled action button (navigate, download, external link) |
| `cal` | `CalendarOptions` | Full-calendar view (FullCalendar options) |
| `chart` | `EChartsOption` | Apache ECharts chart |
| `chat` | `ChatConfig` | Matrix chat channel |
| `emergency` | — | Emergency notice section |
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
| `people` | `PeopleConfig` | Avatar + name grid of persons |
| `rag` | `RagConfig` | Retrieval-augmented generation chat interface |
| `slider` | `SliderConfig` | Image slider / carousel |
| `table` | `TableConfig` | HTML-rendered data table with styled header/body |
| `tasks` | `TasksConfig` | Task list for the current user |
| `tracker` | `TrackerConfig` | GPS location tracker with configurable interval |
| `video` | `VideoConfig` | Embedded video (YouTube or other iframe) |

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
- `edit()` — opens `SectionEditModalComponent`; creates or updates on confirm
- `delete()` — confirmation-guarded deletion
- `uploadImage(section)` — picks a file, uploads to Firebase Storage at `tenant/<tid>/section/<id>/image/<name>`, updates the section's `properties.images` array, and creates a `DocumentModel`
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
| `AlbumSectionComponent` | `bk-album-section` | Photo/video gallery |
| `CalendarSectionComponent` | `bk-calendar-section` | FullCalendar |
| `OrgchartSectionComponent` | `bk-orgchart-section` | Organization chart |
| `PeopleSectionComponent` | `bk-people-section` | Avatar grid |
| `EventsSectionComponent` | `bk-events-section` | Event list |
| `NewsSectionComponent` | `bk-news-section` | Blog news list |
| `RagSectionComponent` | `bk-rag-section` | RAG chat interface |

## Data Access
`SectionService` (`@bk2/cms-section-data-access`) is the Firestore gateway:
- `list()` — real-time stream of all sections for the tenant
- `read(id)` — real-time stream for a single section
- `searchByKeys(keys)` — one-time fetch of multiple sections by key (used by `PageSortModal`)
- `create / update / delete` — write operations

## Content State Visibility
In `ContentPage`, only sections with `state === 'published'` are shown to non-admin users. `contentAdmin` users see all states; section borders are colour-coded by state in edit mode.
