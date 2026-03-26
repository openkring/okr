# Address Domain

## Overview
`AddressModel` stores contact and communication details for any subject (person or org). Each address belongs to exactly one parent subject via `parentKey` (format: `modelType.key`, e.g. `org.abc123` or `person.xyz789`). A single subject can have multiple addresses of different channels (email, phone, postal, web, social media, bank account, Twint).

Addresses are shown in the `AddressesAccordionComponent` inside the org-edit and person-edit modals, and in the `AddressesListComponent` for standalone list views.

## Firestore Collection
Collection name: `addresses`

## Field Semantics
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `parentKey` | string | Reference to the owning subject: `modelType.key` (e.g. `org.abc`, `person.xyz`) |
| `addressChannel` | string | Channel type: `email`, `phone`, `postal`, `web`, `twitter`, `xing`, `facebook`, `linkedin`, `instagram`, `bankaccount`, `twint` |
| `addressChannelLabel` | string | Optional label when a custom/unlisted channel is used |
| `addressUsage` | string | Usage context: `home`, `work`, `mobile`, etc. (category: `address_usage`) |
| `addressUsageLabel` | string | Optional label for a custom usage |
| `email` | string | Email address (used when `addressChannel === 'email'`) |
| `phone` | string | Phone number (used when `addressChannel === 'phone'`) |
| `iban` | string | IBAN (used when `addressChannel === 'bankaccount'`) |
| `url` | string | URL or social-media handle; also stores the EZS download URL for bank-account addresses |
| `streetName` | string | Street name (postal addresses) |
| `streetNumber` | string | Street number (postal addresses) |
| `addressValue2` | string | Optional secondary address line (c/o, company) |
| `zipCode` | string | Postal code |
| `city` | string | City |
| `countryCode` | string | ISO country code |
| `isFavorite` | boolean | Marks the preferred address per channel/usage |
| `isCc` | boolean | Address is used as CC on correspondence |
| `isValidated` | boolean | Address has been manually validated |
| `isArchived` | boolean | Soft-delete flag |
| `tags` | string | Space-separated chip tags for filtering |
| `notes` | string | Free-text notes |
| `index` | string | Search index string (format: `n:<addressValue>`) |

## Address Channels
| Channel | Primary Field | Action |
|---|---|---|
| `email` | `email` | Opens `mailto:` link |
| `phone` | `phone` | Opens `tel:` link |
| `postal` | `streetName`, `streetNumber`, `zipCode`, `city`, `countryCode` | Geocodes and shows on map |
| `web` | `url` | Opens URL in browser |
| `twitter` | `url` | Navigates to `https://twitter.com/<url>` |
| `xing` | `url` | Navigates to `https://www.xing.com/profile/<url>` |
| `facebook` | `url` | Navigates to `https://www.facebook.com/<url>` |
| `linkedin` | `url` | Navigates to `https://www.linkedin.com/in/<url>` |
| `instagram` | `url` | Navigates to `https://www.instagram.com/<url>` |
| `bankaccount` | `iban`, `url` | Downloads EZS PDF from `url` |
| `twint` | — | Twint payment channel (no further action) |

## Swiss QR Bill Generation
When `addressChannel === 'bankaccount'` the store can call the `generateQrBill` Cloud Function (region `europe-west6`). The function generates a Swiss QR-bill PDF, stores it in Firebase Storage, and returns the `storagePath`. The store then:
1. Gets a download URL via the client Firebase Storage SDK.
2. Ensures the `ezs` folder exists in the document tree.
3. Creates a `DocumentModel` linked to that folder.
4. Updates `address.url` with the download URL.

## Store: `AddressStore`
NgRx Signal Store (`@ngrx/signals`). Provided at the component level.

### State
| Property | Type | Description |
|---|---|---|
| `parentKey` | string | Key of the owning subject; set to `'all'` to load all addresses |
| `searchTerm` | string | Free-text filter against `index` |
| `selectedTag` | string | Tag chip filter |
| `selectedChannel` | string | Channel filter |
| `orderByParam` | string | Firestore `orderBy` field (default: `addressChannel`) |

### Key Methods
| Method | Description |
|---|---|
| `setParentKey(key)` | Loads addresses for a given parent |
| `add(readOnly)` | Opens `AddressEditModalComponent` for a new address |
| `edit(address, readOnly)` | Opens `AddressEditModalComponent` for an existing address |
| `delete(address, readOnly)` | Confirms then deletes |
| `copy(address)` | Copies address string to clipboard |
| `use(address)` | Executes the channel-specific action (open URL, call, show map, etc.) |
| `generateQrEzs(address)` | Generates a Swiss QR bill PDF via Cloud Function |
| `uploadFile(address)` | Uploads a file and links its URL to the address |

## Components
| Component | Description |
|---|---|
| `AddressEditModalComponent` | Ionic modal; hosts `AddressFormComponent` from `@bk2/subject-address-ui`; dismisses with `'confirm'` role |
| `AddressesListComponent` | Standalone list with search/filter |
| `AddressesAccordionComponent` | Accordion panel embedded in org/person edit modals |

## Validation (`@bk2/subject-address-util`)
Vest validation suites cover: `email`, `phone`, `iban`, and the composite `address` suite.

## Authorization
- Read: any authenticated user with access to the parent subject
- Create / Update: requires write access to the parent (typically `memberAdmin` or `admin`)
- Delete: same as write; requires confirmation dialog
