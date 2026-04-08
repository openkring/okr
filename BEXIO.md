# Bexio Contact Sync

This document describes how the app synchronises contact data with the Bexio accounting system.

## Overview

The app is always the **master of contact data**. Bexio is a downstream system.  
All sync operations push data *from* the app *to* Bexio — never the other way around.

## Data model

Each person or org in the app may carry a `bexioId` field (the Bexio numeric contact ID, stored as a string).  
Memberships carry a parallel field `memberBexioId` which must stay consistent with the person/org `bexioId`.  
The `buildIndex()` method in `AocBexioStore` reconciles these two fields automatically before comparing with Bexio.

### `BexioIndex` structure

Each entry in the index represents one contact slot after joining app records with Bexio contacts by name key:

| Field group | Fields | Source |
|---|---|---|
| App (person/org) | `bkey`, `name1`, `name2`, `type`, `bexioId`, `streetName`, `streetNumber`, `zipCode`, `city`, `email` | Firestore |
| Membership | `mkey`, `mbexioId` | Firestore |
| Bexio | `bx_id`, `bx_name1`, `bx_name2`, `bx_type`, `bx_streetName`, `bx_streetNumber`, `bx_zipCode`, `bx_city`, `bx_email` | Bexio API via Cloud Function |

## Sync states

When opening a contact in `AocBexioContactEditModal`, the bottom of the dialog shows one of four states:

| Condition | State | UI shown |
|---|---|---|
| `bkey` present, `bx_id` present, **no field mismatches** | **In sync** | Green label "Sync is ok" |
| `bkey` present, `bx_id` present, **field mismatches exist** | **Needs update** | "Update Bexio Contact" button (warning colour) |
| `bkey` present, `bx_id` **absent** | **Not in Bexio yet** | "Create in Bexio" button (primary colour) |
| `bkey` **absent**, `bx_id` present | **Bexio-only orphan** | Red warning label — manual action required |

### Orphan contacts (Bexio-only)

If a contact exists in Bexio but has no corresponding person/org in the app, **no automated action is taken**.  
The user must either:
1. Create the person/org in the app manually, or
2. Delete the contact in Bexio manually.

Automated import from Bexio into the app is intentionally not supported to preserve the app-as-master principle.

## Index build process (`buildIndex`)

1. Load all persons and orgs from `AppStore` (already in memory).
2. Load all memberships for the default org (tenant) from Firestore.
3. Build a `BexioIndex[]` from persons and orgs, keyed by `getFullName(name1, name2).toLowerCase()`.
4. Reconcile `person/org.bexioId` ↔ `membership.memberBexioId`: if one side has the ID and the other doesn't, update the missing side in Firestore.
5. Fetch all Bexio contacts via the `getBexioContacts` Cloud Function.
6. Join by name key: enrich matching entries with `bx_*` fields; append unmatched Bexio contacts as orphan entries (empty `bkey`).
7. Sort the final index alphabetically by key.

## Cloud Functions

| Function | Purpose |
|---|---|
| `getBexioContacts` | Fetches all contacts from `GET /2.0/contact` |
| `createBexioContact` | Creates a new contact via `POST /2.0/contact` |
| `updateBexioContact` | Updates an existing contact via `POST /2.0/contact/{id}` |

All functions are deployed to `europe-west6`, require Firebase App Check, and read the Bexio API key from GCP Secret Manager (`BEXIO_APIKEY`).

## Store methods (`AocBexioStore`)

| Method | Triggered by |
|---|---|
| `buildIndex()` | Manual "Sync" button in `AocBexio` list view |
| `addToBexio(item)` | Modal dismissed with role `'create'` |
| `updateInBexio(item)` | Modal dismissed with role `'update'` |
| `addToBk(item)` | "Add to app" button in list view (Bexio-only row) |
| `edit(item)` | Edit icon in list view — opens `AocBexioContactEditModal` |
