# Group Domain

## Overview
`GroupModel` represents a named collection of persons (members), typically belonging to an organization. Groups support an optional set of collaborative features: content page, chat room, calendar, tasks, file storage, and photo album. A group can be administered by a designated group admin person.

Groups are displayed in `GroupListComponent` and explored in detail via `GroupViewPageComponent`, which uses a segmented tab layout to switch between the group's features.

## Firestore Collection
Collection name: `groups`

## Field Semantics
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID; user-defined on creation — must be unique; stripped on write, re-attached on read |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `name` | string | Human-readable group name |
| `notes` | string | Free-text notes |
| `tags` | string | Space-separated chip tags for filtering |
| `icon` | string | Icon name (default: `'group'`) |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Search index string |
| `hasContent` | boolean | Group has a CMS content page (page id = group bkey + `_content`) |
| `hasChat` | boolean | Group has a Matrix chat room (section id = group bkey + `_chat`) |
| `hasCalendar` | boolean | Group has a calendar (calendar id = group bkey) |
| `hasTasks` | boolean | Group has a task list (task id = group bkey) |
| `hasFiles` | boolean | Group has a file folder (root path: `groups/<bkey>`) |
| `filesFolder` | string | Storage folder key for files (set to `bkey` when `hasFiles = true`) |
| `hasAlbum` | boolean | Group has a photo album folder |
| `albumFolder` | string | Storage folder key for album (set to `a_<bkey>` when `hasAlbum = true`) |
| `hasMembers` | boolean | Group has a members list |
| `mainContact` | AvatarInfo | Reference to the main contact person (name, key, modelType) |
| `admin` | AvatarInfo | Reference to the group admin person |
| `parentKey` | string | Key of the parent org or group |
| `parentName` | string | Name of the parent org or group |
| `parentModelType` | `'org'` \| `'group'` | Type of the parent |
| `visibility` | string | Comma-separated `RoleName` list (e.g. `'registered,privileged'`). Users who have **any** of these roles can access the group's calendar and chat even without being a member. Empty string (default) means members-only access. |
| `notifyType` | `'memberOnly'` \| `'membersAndMatchingVisibility'` | Controls who receives chat notifications. `'memberOnly'` (default): only registered group members. `'membersAndMatchingVisibility'`: members plus all users whose roles match `visibility`. |

## Related Collections Created on Group Creation
When a new group is created, the store automatically provisions:
| Collection | Document key | Purpose |
|---|---|---|
| `calendars` | `<groupBkey>` | Group calendar |
| `sections` | `g-<groupBkey>` | Default article section for the content page |
| `sections` | `<groupBkey>_chat` | Chat section |
| `pages` | `<groupBkey>_content` | Content page linking to the article section |
| `pages` | `<groupBkey>_chat` | Chat page linking to the chat section |
| Matrix room | — | Matrix group chat room via `MatrixChatService` |

## Store: `GroupStore`
NgRx Signal Store (`@ngrx/signals`). Provided at the component level.

### State
| Property | Type | Description |
|---|---|---|
| `searchTerm` | string | Free-text filter against `index` |
| `selectedTag` | string | Tag chip filter |
| `groupKey` | string \| undefined | Key of the currently selected/viewed group |
| `selectedSegment` | string \| undefined | Active tab in `GroupViewPageComponent` (default: `'content'`) |

### Key Methods
| Method | Description |
|---|---|
| `setGroupKey(key)` | Loads a single group by key |
| `setSelectedSegment(segment)` | Switches the active view segment |
| `add(readOnly)` | Opens `GroupEditModalComponent` to create a new group; provisions all related resources on confirm |
| `edit(group, readOnly)` | Opens `GroupEditModalComponent` for an existing group |
| `view(group)` | Navigates to `/group-view/<groupKey>` |
| `delete(group, readOnly)` | Confirms then deletes the group |
| `save(group)` | Persists a group without modal |
| `saveAvatar(photo)` | Uploads a group avatar image |
| `addMember()` | Opens `PersonSelectModalComponent` and creates a `MembershipModel` |
| `createGroupPage(group, postfix, name, sectionId)` | Creates a CMS page for the group |
| `createGroupCalendar(group)` | Creates a `CalendarModel` for the group |

## Components
| Component | Description |
|---|---|
| `GroupListComponent` | List with search/tag filters; shows member avatars; actions via ActionSheet (show, edit, delete, addPage); requires `'memberAdmin'` role for write actions |
| `GroupEditModalComponent` | Ionic modal; hosts `GroupFormComponent`; supports selecting mainContact and admin persons via `PersonSelectModalComponent` |
| `GroupViewPageComponent` | Full-page view with segmented tabs: content, chat, calendar, tasks, files, album, members; resets `PageStore.pageId` on Ionic back-navigation via `ionViewWillEnter` |

## Segments in `GroupViewPageComponent`
| Segment | Component | Visibility |
|---|---|---|
| `content` | `PageDispatcher` (page: `<id>_content`) | when `hasContent` |
| `chat` | `PageDispatcher` (page: `<id>_chat`) | when `hasChat` |
| `calendar` | `CalEventListComponent` | when `hasCalendar` |
| `tasks` | `TaskListComponent` | when `hasTasks` |
| `files` | `DocumentListComponent` (folder: `f:<id>`) | when `hasFiles` |
| `album` | `DocumentListComponent` (folder: `f:a_<id>`) | when `hasAlbum` |
| `members` | `MembershipListComponent` | when `hasMembers` |

## Injection Token: `GROUP_EDIT_MODAL`

`GroupEditModalComponent` is also consumed by `cms-section-feature` (OrgchartSection, ContextDiagramSection) to let users edit groups directly from diagrams. To avoid a circular library dependency (`cms-section-feature` → `subject-group-feature` → `cms-page-feature` → `cms-section-feature`), the component is not imported directly there.

Instead, an `InjectionToken<Type<unknown>>` called `GROUP_EDIT_MODAL` is defined in `@bk2/subject-group-ui` (a lower-level lib that both sides can depend on). The consuming stores inject the token and pass it as the `component` to Ionic's `ModalController.create()`. The concrete `GroupEditModalComponent` is provided once in `app.config.ts`:

```typescript
{ provide: GROUP_EDIT_MODAL, useValue: GroupEditModalComponent }
```

Any future feature lib that needs to open the group edit modal across a dependency boundary should follow the same pattern.

## Authorization
- List / view: any authenticated user
- Edit / create / delete: requires `'memberAdmin'` or `'admin'` role
- Add page: requires `'admin'` role
