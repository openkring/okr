# Menu Domain

## Overview
The Menu domain manages the navigation structure of the application. Each `MenuItemModel` represents one node in the navigation tree. Menu items can navigate to internal routes, open external URLs in the browser, act as group containers for sub-menus, serve as visual dividers, or trigger in-app calls (e.g. dismiss a popover with a value). Menu items are filtered by the `roleNeeded` field so that only users with the required role can see them.

The `MenuComponent` (`bk-menu`) is the primary rendering component. It receives a menu item name as input, loads the item from the `MenuStore`, and switches on the `action` field to render the appropriate UI (leaf item, sub-menu accordion, divider, main list, or context list). It is recursive: sub-menus render nested `<bk-menu>` components.

## Firestore Collection
Collection name: `menuItems`

## Field Semantics
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `isArchived` | boolean | Soft-delete flag |
| `name` | string | Internal unique name used as a lookup key (e.g. `aoc`, `help`, `members`) |
| `index` | string | Search index — format `n:<name> a:<action> k:<bkey>` |
| `label` | string | i18n key displayed to the user in the menu (may contain `@VERSION@` placeholder) |
| `icon` | string | Ion-icon name shown next to the label (default: `help-circle`) |
| `action` | string | The action type (see Actions below) |
| `url` | string | Target URL for `navigate` and `browse` actions, or route for `call` |
| `data` | BaseProperty[] | Optional URL / route parameters passed alongside the URL |
| `menuItems` | string[] | Child menu item names for `sub`, `main`, and `context` action types |
| `roleNeeded` | RoleName | Minimum role required to see this item (default: `contentAdmin`) |
| `description` | string | Human-readable notes about the menu item |
| `tags` | string | Comma-separated tags for filtering |

## Action Types
| Action | Behaviour |
|---|---|
| `navigate` | Navigates the Angular router to `url` with optional `data` params |
| `browse` | Opens `url` in the device browser via Capacitor `Browser.open` |
| `sub` | Renders an `IonAccordion` and recurses into `menuItems` children |
| `divider` | Renders an `IonItemDivider` with a translated label |
| `main` | Renders a flat `IonList` of child items (top-level sidebar menu) |
| `context` | Renders a flat `IonList` of child items (context / popover menu) |
| `call` | Dismisses the current popover, passing `url` as the selected value |

## Authorization
The `roleNeeded` field is evaluated by `hasRole()` at render time. Items whose `roleNeeded` exceeds the current user's role are simply not rendered. Login/logout items are handled as special cases based on `url === '/auth/login'` or `'/auth/logout'`.

## State (MenuStore)
The `MenuStore` (NgRx Signal Store, `providedIn: 'root'`) holds:
- `name` — the current menu item name being rendered
- `searchTerm` / `selectedCategory` — filters used in the admin list view
- `menuResource` — live Firestore stream for a single item (keyed by `name`)
- `menuItemsResource` — live Firestore stream of all menu items (for admin list)

## Key Components
| Component | Selector | Role |
|---|---|---|
| `MenuComponent` | `bk-menu` | Recursive renderer; switches on `action` type |
| `MenuListComponent` | `bk-menu-item-all-list` | Admin list with search/filter and CRUD action sheet |
| `MenuItemModalComponent` | (modal) | Edit/view modal for a single menu item |

## Data Access
`MenuService` (`@bk2/cms-menu-data-access`) is the Firestore gateway. It exposes:
- `list()` — real-time stream of all menu items for the tenant
- `read(name)` — real-time stream for a single item by name
- `create / update / delete` — write operations guarded by the store

## Search Index Format
`n:<name> a:<action> k:<bkey>`
