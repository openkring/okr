# Bexio Integration

This document describes how the app integrates with the Bexio accounting system for contacts, invoices, bills, journal entries, and accounts.

## Overview

The app is always the **master of contact data**. Bexio is a downstream system.  
All sync operations push data *from* the app *to* Bexio — never the other way around (except for the initial data download).

---

## Contact Sync

### Data model

Each person or org in the app may carry a `bexioId` field (the Bexio numeric contact ID, stored as a string).  
Memberships carry a parallel field `memberBexioId` which must stay consistent with the person/org `bexioId`.  
The `buildIndex()` method in `AocBexioStore` reconciles these two fields automatically before comparing with Bexio.

### `BexioIndex` structure

Each entry in the index represents one contact slot after joining app records with Bexio contacts by name key:

| Field group | Fields | Source |
| --- | --- | --- |
| App (person/org) | `bkey`, `name1`, `name2`, `type`, `bexioId`, `streetName`, `streetNumber`, `zipCode`, `city`, `email` | Firestore |
| Membership | `mkey`, `mbexioId`, `dateOfExit` | Firestore |
| Bexio | `bx_id`, `bx_name1`, `bx_name2`, `bx_type`, `bx_streetName`, `bx_streetNumber`, `bx_zipCode`, `bx_city`, `bx_email` | Bexio API via Cloud Function |

### Sync states

When opening a contact in `AocBexioContactEditModal`, the bottom of the dialog shows one of four states:

| Condition | State | UI shown |
| --- | --- | --- |
| `bkey` present, `bx_id` present, **no field mismatches** | **In sync** | Green label "Sync is ok" |
| `bkey` present, `bx_id` present, **field mismatches exist** | **Needs update** | "Update Bexio Contact" button (warning colour) |
| `bkey` present, `bx_id` **absent** | **Not in Bexio yet** | "Create in Bexio" button (primary colour) |
| `bkey` **absent**, `bx_id` present | **Bexio-only orphan** | Red warning label — manual action required |

#### Orphan contacts (Bexio-only)

If a contact exists in Bexio but has no corresponding person/org in the app, **no automated action is taken**.  
The user must either create the person/org in the app manually, or delete the contact in Bexio manually.  
Automated import from Bexio into the app is intentionally not supported to preserve the app-as-master principle.

### Index build process (`buildIndex`)

1. Load all persons and orgs from `AppStore` (already in memory).
2. Load all memberships for the default org (tenant) from Firestore.
3. Build a `BexioIndex[]` from persons and orgs, keyed by `getFullName(name1, name2).toLowerCase()`.
4. Reconcile `person/org.bexioId` ↔ `membership.memberBexioId`: if one side has the ID and the other doesn't, update the missing side in Firestore.
5. Fetch all Bexio contacts via the `getBexioContacts` Cloud Function.
6. Join by name key: enrich matching entries with `bx_*` fields; append unmatched Bexio contacts as orphan entries (empty `bkey`).
7. Sort the final index alphabetically by key.

---

## Invoice Sync

Invoices are downloaded from Bexio into the Firestore `invoices` collection. Each invoice is stored with `bkey = String(bexio_id)` for idempotent upserts.

### Sync pointer

`config/bexioSync.lastSyncedAt` stores the datetime of the last successful sync as `"YYYY-MM-DD HH:mm:ss"`. The scheduled function reads this, fetches only invoices with `updated_at >` that value, then updates the pointer.

### API

Uses Bexio **v2** (`POST /2.0/kb_invoice/search`) with offset-based pagination (500 per page).

### Field mapping

| Bexio field | InvoiceModel field | Notes |
| --- | --- | --- |
| `id` | `bkey` | `String(id)` |
| `document_nr` | `invoiceId` | also used as `title` fallback |
| `title` | `title` | falls back to `document_nr` if null |
| `header` | `header` | |
| `footer` | `footer` | |
| `is_valid_from` | `invoiceDate` | `YYYY-MM-DD` → `YYYYMMDD` (StoreDate) |
| `is_valid_to` | `dueDate` | `YYYY-MM-DD` → `YYYYMMDD` (StoreDate) |
| `total` | `totalAmount.amount` | multiplied by 100, currency hardcoded to `CHF` |
| `total_taxes` | `taxes` | `parseFloat` |
| `mwst_type` | `vatType` | 0=included, 1=excluded, 2=exempt |
| `kb_item_status_id` | `state` | 7=draft, 8=pending, 9=paid, 19=cancelled |
| `contact_id` | `notes` | stored raw for later resolution into `receiver` |

---

## Bill Sync

Bills (Kreditoren) are downloaded from Bexio into the Firestore `bills` collection. Each bill is stored with `bkey = String(bexio_id)`.

### Bill sync pointer

`config/bexioSync.lastBillSyncedAt` stores the datetime of the last successful bill sync. The scheduled function uses this as the `createdAfter` filter.

### Bill API

Uses Bexio **v4** (`GET /4.0/purchase/bills`) with page-based pagination (500 per page). The response is `{ data: BexioBill[], paging: { page, page_size, page_count, item_count } }`.

### Bill field mapping

| Bexio field | BillModel field | Notes |
| --- | --- | --- |
| `id` | `bkey` | `String(id)` |
| `document_no` | `billId` | also used as `title` fallback |
| `title` | `title` | falls back to `document_no` if null |
| `status` | `state` | lowercased |
| `vendor` | `bexioVender` | raw object or string |
| `bill_date` | `billDate` | `YYYY-MM-DD` → `YYYYMMDD` (StoreDate) |
| `due_date` | `dueDate` | `YYYY-MM-DD` → `YYYYMMDD` (StoreDate) |
| `gross` | `totalAmount.amount` | `parseFloat * 100`, currency `CHF` |
| `booking_account_ids` | `bookingAccount` | joined as comma-separated string |
| `attachment_ids` | `attachments` | array of UUID strings |

---

## Journal Sync

Journal entries (Buchungsjournal) are downloaded from Bexio into the Firestore `journallogs` collection. Each entry is stored with `bkey = String(bexio_id)`.

**Note:** Journal sync always fetches the full history (no incremental filter). The sync pointer `config/bexioSync.lastJournalSyncedAt` records when the last sync ran but is not used as a filter.

### Journal API

Uses Bexio **v3** (`GET /3.0/accounting/journal`) with offset-based pagination (500 per page, flat array response).

### Journal field mapping

| Bexio field | JournalModel field | Notes |
| --- | --- | --- |
| `id` | `bkey` | `String(id)` |
| `description` | `title` | falls back to `''` if null |
| `date` | `date` | ISO datetime trimmed to `YYYY-MM-DD` → `YYYYMMDD` (StoreDate) |
| `debit_account_id` | `debitAccount` | `String(id)` or `''` |
| `credit_account_id` | `creditAccount` | `String(id)` or `''` |
| `amount` | `totalAmount.amount` | `parseFloat * 100`, currency `CHF` |

### Index field format

`d:{date} a:{amount} {debitAccount}/{creditAccount}`

---

## Account Sync

Account groups and accounts are downloaded from Bexio into the Firestore `accounts` collection as a hierarchical tree.

### Tree structure

- **Root node**: `bkey = 'bexio_root'`, `type = 'root'`
- **Account groups**: `bkey = String(group.id)`, `type = 'group'`, `parentId` = parent group id or `'bexio_root'`
- **Leaf accounts**: `bkey = String(account.id)`, `type = 'leaf'`, `parentId` = account group id or `'bexio_root'`

Only active (`is_active = true`) and unlocked (`is_locked = false`) groups and accounts are synced.

### Account API

Uses Bexio **v2**:

- `GET /2.0/account_groups` — account groups
- `GET /2.0/accounts` — individual accounts

### Account field mapping

| Bexio field | AccountModel field | Notes |
| --- | --- | --- |
| `id` | `bkey`, `notes` | `String(id)` |
| `account_no` | `id` | account/group number |
| `name` | `name` | |
| `parent_fibu_account_group_id` | `parentId` | `null` → `'bexio_root'` |

---

## Cloud Functions

All functions are in `apps/functions/src/bexio/`, deployed to `europe-west6`, require Firebase App Check, and read credentials from GCP Secret Manager.

| Function | Trigger | Schedule | API | Purpose |
| --- | --- | --- | --- | --- |
| `getBexioContacts` | onCall | — | v2 | Fetch all contacts from Bexio |
| `createBexioContact` | onCall | — | v2 | Create a new contact in Bexio |
| `updateBexioContact` | onCall | — | v2 | Update an existing contact in Bexio |
| `syncBexioInvoices` | onCall | — | v2 | Manual invoice sync (optional `fromDate`) |
| `scheduledBexioInvoiceSync` | onSchedule | 06:00 CET daily | v2 | Incremental invoice sync |
| `showInvoicePdf` | onCall | — | v2 | Fetch invoice PDF as base64 |
| `createBexioInvoice` | onCall | — | v2 | Create a new invoice in Bexio |
| `syncBexioBills` | onCall | — | v4 | Manual bill sync (optional `fromDate`) |
| `scheduleBexioBillSync` | onSchedule | 06:00 CET daily | v4 | Incremental bill sync |
| `showBillPdf` | onCall | — | v3 | Fetch bill attachment PDF as base64 |
| `syncBexioJournal` | onCall | — | v3 | Manual full journal sync |
| `scheduleBexioJournalSync` | onSchedule | 06:15 CET daily | v3 | Full journal sync (always full history) |
| `syncBexioAccounts` | onCall | — | v2 | Download account groups + accounts as tree |

### GCP Secrets

| Secret | Used by | Purpose |
| --- | --- | --- |
| `BEXIO_APIKEY` | all functions | Bexio REST API bearer token |
| `BEXIO_USER_ID` | `createBexioContact`, `updateBexioContact` | Integer user ID from `GET /2.0/users/me` |
| `BEXIO_TENANT_ID` | all sync functions | Firestore tenantId for writing documents (e.g. `scs`) |
| `BEXIO_DEFAULT_TAX_ID` | `createBexioInvoice` | Default Bexio tax ID for invoice positions |

Set with: `firebase functions:secrets:set SECRET_NAME`

---

## Store methods (`AocBexioStore`)

| Method | Triggered by |
| --- | --- |
| `buildIndex()` | Manual "Sync" button in `AocBexio` list view |
| `addToBexio(item)` | Modal dismissed with role `'create'` |
| `updateInBexio(item)` | Modal dismissed with role `'update'` |
| `addToBk(item)` | "Add to app" button in list view (Bexio-only row) |
| `edit(item)` | Edit icon in list view — opens `AocBexioContactEditModal` |
| `syncInvoices()` | "Full history" button in Invoices card |
| `syncBills()` | "Full history" button in Bills card |
| `syncJournal()` | "Full sync" button in Journal card |
| `syncAccounts()` | "Sync accounts" button in Accounts card |
| `clearAccountTree(rootName)` | "Clear tree" button in Accounts card |
| `linkInvoiceReceivers()` | "Verknüpfen" button in Rechnungs-Empfänger card |
| `linkBillVendors()` | "Verknüpfen" button in Vendor Sync card |

---

## Sync pointers (`config/bexioSync`)

| Field | Updated by | Used by |
| --- | --- | --- |
| `lastSyncedAt` | `syncBexioInvoices`, `scheduledBexioInvoiceSync` | `scheduledBexioInvoiceSync` (incremental filter) |
| `lastBillSyncedAt` | `syncBexioBills`, `scheduleBexioBillSync` | `scheduleBexioBillSync` (incremental filter) |
| `lastJournalSyncedAt` | `syncBexioJournal`, `scheduleBexioJournalSync` | recorded only — journal always syncs full history |
