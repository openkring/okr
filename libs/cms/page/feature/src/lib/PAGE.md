# Page Domain

## Overview
The Page domain models the top-level content containers of the CMS. A `PageModel` holds metadata (title, SEO tags, state) and an ordered list of section IDs. The `PageDispatcher` component reads a page from the route, loads it via `PageStore`, and switches on `page.type` to render the correct page component. This keeps routing simple (`/private/:id` or `/public/:id`) while still supporting many distinct page layouts.

Pages are private by default (`isPrivate = true`). If a private page is reached through a `/public/` route, `PageDispatcher` immediately redirects to `/auth/login`.

## Firestore Collection
Collection name: `pages`

## Field Semantics
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `name` | string | Internal name of the page |
| `index` | string | Search index — format `n:<name> k:<bkey>` |
| `title` | string | Page title used for SEO (`<title>` tag) |
| `subTitle` | string | Secondary title |
| `abstract` | string | Short description shown on landing and error pages |
| `logoUrl` | string | URL to the page logo image |
| `logoAltText` | string | Accessible alt text for the logo |
| `bannerUrl` | string | URL to the hero/background banner image |
| `bannerAltText` | string | Accessible alt text for the banner |
| `meta` | MetaTag[] | Additional HTML meta tags for SEO (`name` + `content` pairs) |
| `type` | string | Page layout type (see Page Types below) |
| `state` | string | Content state (`draft`, `inReview`, `published`, `cancelled`, etc.) |
| `notes` | string | Detailed internal description |
| `sections` | string[] | Ordered list of section IDs belonging to this page; supports `@TID@` placeholder for tenant substitution |
| `isPrivate` | boolean | If `true` the page requires authentication; public routes are blocked |
| `blogType` | BlogLayoutType | Layout variant for `blog` pages (see Blog Layout Types below) |

## Page Types
| Type | Component | Description |
|---|---|---|
| `content` | `ContentPage` | Standard page with an ordered grid of sections |
| `dashboard` | `DashboardPage` | Dashboard layout |
| `blog` | `BlogPage` | Blog layout, further specialized by `blogType` |
| `chat` | `ChatPage` | Full-screen Matrix chat page |
| `files` | `FilesPage` | File-browser page |
| `album` | `AlbumPage` | Photo album page |
| `graph` | `GraphPage` | Menu-graph visualization page |
| `landing` | `LandingPage` | Public landing / marketing page |
| `error` | `ErrorPage` | Error pages (e.g. 404, unknownPageType) |

## Blog Layout Types
`minimal` | `grid` | `classic` | `magazine` | `bento` | `stream`

## Page Dispatcher
`PageDispatcher` (`bk-page-dispatcher`) is the single routable entry point for all pages. It:
1. Receives `id` from the route (supports `@TID@` substitution).
2. Sets `pageId` on `PageStore`, triggering the Firestore live stream.
3. Switches on `page.type` to render the matching page component with `@defer` for heavier types.
4. Redirects private pages accessed over `/public/` to `/auth/login`.
5. Re-loads on `ionViewWillEnter` to handle back-navigation from Ionic cache.

## State (PageStore)
The `PageStore` (NgRx Signal Store, `providedIn: 'root'`) holds:
- `pageId` / `sectionId` — currently loaded identifiers
- `searchTerm`, `selectedTag`, `selectedType`, `selectedState` — list filters
- `pagesResource` — live Firestore stream of all pages (for admin list)
- `pageResource` — live Firestore stream combining the page document with `combineLatest` over all its sections

The `pageResource` resolves the full `sections` list reactively: any section document change propagates immediately to the UI.

## ContentPage Edit Mode
`ContentPage` supports an in-place edit mode (toggled via the context menu). In edit mode:
- Each section is wrapped in a coloured border indicating its `state` (draft=blue, inReview=yellow, published=green, cancelled/archived=red).
- Clicking a section opens an ActionSheet with actions: edit, upload image, send email, remove from page.
- Nested sections inside accordion sections are excluded from the top-level list to avoid duplication.
- Only `published` sections are visible to non-admin users.

## Section Reference Placeholder
Section IDs in `page.sections` may contain `@TID@`, which is resolved to the tenant ID at load time. This allows shared cross-tenant section references.

## Key Components
| Component | Selector | Role |
|---|---|---|
| `PageDispatcher` | `bk-page-dispatcher` | Route entry point; dispatches to page type components |
| `ContentPage` | `bk-content-page` | Standard section grid, supports edit mode |
| `DashboardPage` | `bk-dashboard-page` | Dashboard layout |
| `BlogPage` | `bk-blog-page` | Blog layout with `blogType` variants |
| `ChatPage` | `bk-chat-page` | Matrix chat integration |
| `FilesPage` | `bk-files-page` | Document browser |
| `AlbumPage` | `bk-album-page` | Photo album |
| `GraphPage` | `bk-graph-page` | Menu-graph visualization |
| `LandingPage` | `bk-landing-page` | Public landing page |
| `PageListComponent` | (admin) | Admin list with search/filter and CRUD |
| `PageEditModalComponent` | (modal) | Edit/view modal for page metadata |
| `PageSortModalComponent` | (modal) | Drag-to-reorder sections within a page |

## Data Access
`PageService` (`@bk2/cms-page-data-access`) and `SectionService` (`@bk2/cms-section-data-access`) are the Firestore gateways. `PageStore` combines them: it first loads the `PageModel`, then fans out to individual section reads via `combineLatest`.

## Search Index Format
`n:<name> k:<bkey>`
