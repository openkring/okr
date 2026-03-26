# Org Domain

## Overview
`OrgModel` represents an organization or company. The type field distinguishes subtypes (e.g. club, company, association). Orgs support membership hierarchies and can own resources, hold reservations, and maintain document archives. Addresses are stored separately in the `addresses` collection with `parentKey = 'org.<bkey>'`.

A denormalized snapshot of the primary contact details (favorite email, phone, and postal address) is stored directly on the `OrgModel` to avoid extra reads in list views.

## Firestore Collection
Collection name: `orgs`

## Field Semantics
| Field | Type | Description |
|---|---|---|
| `bkey` | string | Firestore document ID (stripped on write, re-attached on read) |
| `tenants` | string[] | Multi-tenancy isolation; queries always filter by tenantId |
| `name` | string | Legal or display name of the organization |
| `type` | string | Org type category (category: `org_type`, e.g. club, company) |
| `dateOfFoundation` | string | ISO date string of the founding date |
| `dateOfLiquidation` | string | ISO date string of the liquidation date (empty if active) |
| `taxId` | string | Tax identification number |
| `bexioId` | string | External Bexio accounting system ID |
| `membershipCategoryKey` | string | Key of the membership category used for this org (default: `'mcat_default'`) |
| `notes` | string | Free-text notes |
| `tags` | string | Space-separated chip tags for filtering |
| `isArchived` | boolean | Soft-delete flag |
| `index` | string | Search index string |
| `favEmail` | string | Denormalized favorite email (from linked address) |
| `favPhone` | string | Denormalized favorite phone (from linked address) |
| `favStreetName` | string | Denormalized favorite street name |
| `favStreetNumber` | string | Denormalized favorite street number |
| `favZipCode` | string | Denormalized favorite zip code |
| `favCity` | string | Denormalized favorite city |
| `favCountryCode` | string | Denormalized favorite country code |

## Store: `OrgStore`
NgRx Signal Store (`@ngrx/signals`). Provided at the component level.

### State
| Property | Type | Description |
|---|---|---|
| `orgKey` | string | Key of the currently selected org |
| `searchTerm` | string | Free-text filter against `index` |
| `selectedTag` | string | Tag chip filter |
| `selectedType` | string | Type filter (default: `'all'`) |

### Key Methods
| Method | Description |
|---|---|
| `setSearchTerm(term)` | Updates the text filter |
| `setSelectedType(type)` | Updates the org-type filter |
| `setSelectedTag(tag)` | Updates the tag filter |
| `setOrgKey(key)` | Loads a single org by key |
| `add(readOnly)` | Opens `OrgNewModalComponent`; on confirm creates org + initial addresses from the new-org form |
| `edit(org, readOnly)` | Opens `OrgEditModalComponent` for an existing org |
| `delete(org, readOnly)` | Confirms then deletes the org |
| `copyEmailAddresses()` | Copies all visible orgs' favorite emails to the clipboard |
| `export(type)` | Exports the org list (not yet implemented) |

## New Org Flow
When creating a new org via `OrgNewModalComponent`, the form (`OrgNewFormModel`) collects basic fields plus optional initial addresses (email, phone, URL, postal). After the org document is saved, the store creates separate `AddressModel` documents for each non-empty initial address and sets `parentKey = 'org.<newKey>'`.

## Components
| Component | Description |
|---|---|
| `OrgListComponent` | List with search, tag, and type filters; actions via ActionSheet or popover menu |
| `OrgNewModalComponent` | Ionic modal for creating a new org with initial contact data |
| `OrgEditModalComponent` | Ionic modal for editing an existing org; includes embedded accordions for addresses, memberships, ownerships, reservations, documents, members, and comments |

## Embedded Accordions in `OrgEditModalComponent`
| Accordion | Visibility |
|---|---|
| `AddressesAccordionComponent` | Always |
| `MembershipAccordionComponent` | Always |
| `OwnershipAccordionComponent` | `privileged` role or write mode |
| `ReservationsAccordionComponent` | `privileged` role or write mode |
| `DocumentsAccordionComponent` | `privileged` role or write mode |
| `MembersAccordionComponent` | `privileged` role or write mode |
| `CommentsAccordionComponent` | `privileged` role or write mode |

## Validation (`@bk2/subject-org-util`)
Vest suites: `org` (full model), `orgNewForm` (new-org creation form).

## Authorization
- List / view: any authenticated user
- Edit / create / delete: requires `'memberAdmin'` or `'admin'` role
- Privileged accordions (ownerships, reservations, documents, comments): requires `'privileged'` or write access
