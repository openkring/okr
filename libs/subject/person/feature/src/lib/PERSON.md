# Person Domain

## Overview
`PersonModel` represents a natural person. Persons are the central subject entity of the application: they can be members of organizations and groups, linked to user accounts, hold addresses, have ownerships and reservations, and appear as contacts. Addresses are stored separately in the `addresses` collection with `parentKey = 'person.<bkey>'`.

A denormalized snapshot of the primary contact details (favorite email, phone, and postal address) is stored directly on `PersonModel` to avoid extra reads in list views.

## Firestore Collection
Collection name: `persons`

## Field Semantics
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `firstName` | string | First name |
| `lastName` | string | Last name |
| `gender` | string | Gender category (category: `gender`) |
| `ssnId` | string | Social security / AHV number in electronic format |
| `dateOfBirth` | string | ISO date string |
| `dateOfDeath` | string | ISO date string (empty if alive) |
| `bexioId` | string | External Bexio accounting system ID |
| `favEmail` | string | Denormalized favorite email |
| `favPhone` | string | Denormalized favorite phone |
| `favStreetName` | string | Denormalized favorite street name |
| `favStreetNumber` | string | Denormalized favorite street number |
| `favZipCode` | string | Denormalized favorite zip code |
| `favCity` | string | Denormalized favorite city |
| `favCountryCode` | string | Denormalized favorite country code |
| `isArchived` | boolean | Soft-delete flag |
| `tags` | string | Space-separated chip tags for filtering |
| `notes` | string | Free-text notes |
| `index` | string | Search index string |

## Stores

### `PersonListStore`
Manages the full list of persons. Persons are sourced from `AppStore.allPersons()` (already loaded as reference data). The store also reads a `rxResource` for the membership category of the current tenant org.

#### State
| Property | Type | Description |
|---|---|---|
| `orgId` | string | Key of the org used for membership category lookup (initialized to `tenantId`) |
| `searchTerm` | string | Free-text filter against `index` |
| `selectedTag` | string | Tag chip filter |
| `selectedGender` | string | Gender filter (default: `'all'`) |

#### Key Methods
| Method | Description |
|---|---|
| `add(readOnly)` | Opens `PersonNewModal`; on confirm creates person + optional initial addresses + optional membership |
| `edit(person, readOnly)` | Navigates to `/person/<bkey>` with `readOnly` state |
| `delete(person, readOnly)` | Confirms then deletes the person |
| `copyEmailAddresses()` | Copies all visible persons' favorite emails to clipboard |
| `sendEmail(email)` | Opens `mailto:` link |
| `call(phone)` | Opens `tel:` link |
| `chat(person)` | Creates a Matrix direct room and navigates to the chat page |
| `showOnMap(person)` | Geocodes the favorite postal address and displays it on a map modal |

### `PersonEditStore`
Manages a single person detail page. Loaded by `personKey` input.

#### State
| Property | Type | Description |
|---|---|---|
| `personKey` | string \| undefined | Key of the person being edited |

#### Key Methods
| Method | Description |
|---|---|
| `setPersonKey(key)` | Triggers reload of the person resource |
| `save(person)` | Creates or updates the person |
| `saveAvatar(photo)` | Uploads an avatar image for the person |

## New Person Flow
`PersonNewModal` collects basic fields plus optional initial addresses (email, phone, web, postal) and an optional first membership. After the person document is saved, the store creates:
- `AddressModel` documents for each non-empty initial address (`parentKey = 'person.<key>'`)
- A `MembershipModel` in the `memberships` collection (if `shouldAddMembership` is true)

## Components
| Component | Description |
|---|---|
| `PersonListComponent` (person-list.ts) | List with search, tag, and gender filters; actions via ActionSheet |
| `PersonNewModal` | Ionic modal for creating a new person with initial contact and membership data |
| `PersonEditPageComponent` | Full edit page for a single person; embeds addresses, memberships, ownerships, comments, and document accordions |

## Computed Subsets
The `PersonListStore` exposes both `filteredPersons` (all persons matching filters) and `filteredDeceased` (deceased persons matching filters, i.e. `dateOfDeath` is non-empty).

## Validation (`@bk2/subject-person-util`)
Vest suites: `person` (full model), `personNewForm` (new-person creation form), `ssn` (Swiss AHV number).

## Privacy Settings
The visibility of certain fields (gender display in lists) is controlled by `AppStore.privacySettings()`. The `showGender` flag requires a minimum role to display gender information.

## Authorization
- List / view: any authenticated user
- Edit / create / delete: requires `'memberAdmin'` or `'admin'` role
- Delete: requires `'admin'` role
