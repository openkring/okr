# Invoice Feature

This document describes the `finance/invoice` feature library.

## Overview

The invoice feature provides CRUD management of `InvoiceModel` records stored in the Firestore `invoices` collection. Invoices are populated from Bexio via the `syncBexioInvoices` Cloud Function (see `BEXIO.md`).

## Library structure

| Layer | Path | Package |
|---|---|---|
| data-access | `libs/finance/invoice/data-access` | `@bk2/finance-invoice-data-access` |
| feature | `libs/finance/invoice/feature` | `@bk2/finance-invoice-feature` |
| ui | `libs/finance/invoice/ui` | `@bk2/finance-invoice-ui` |
| util | `libs/finance/invoice/util` | `@bk2/finance-invoice-util` |

## Data model

Uses `InvoiceModel` from `@bk2/shared-models`:

| Field | Type | Description |
|---|---|---|
| `bkey` | `string` | Firestore document ID (= Bexio invoice ID after sync) |
| `invoiceId` | `string` | Invoice number (e.g. `RE-2025-042`) |
| `title` | `string` | Invoice description |
| `invoiceDate` | `string` | Issue date (StoreDate `YYYYMMDD`) |
| `dueDate` | `string` | Payment due date (StoreDate) |
| `totalAmount` | `MoneyModel` | Amount in cents + currency (`CHF`) |
| `taxes` | `number` | Total taxes |
| `vatType` | `'included' \| 'excluded' \| 'exempt'` | VAT handling |
| `state` | `string` | `draft` / `pending` / `paid` / `cancelled` |
| `paymentDate` | `string` | Actual payment date (StoreDate) |
| `receiver` | `AvatarInfo` | Linked person or org (populated by "Verknüpfen" in aoc-bexio) |
| `index` | `string` | Searchable index: `i: {invoiceId} a: {amount} n: {receiver} t: {title}` |

## `listId` values

| Value | Filter |
|---|---|
| `'all'` | All invoices for the tenant |
| `'my'` | Invoices where `receiver.key === currentUser.personKey` |
| `{personKey}` | Invoices where `receiver.key === personKey` |

## Components

### `InvoiceList` (`bk-invoice-list`)

Standalone list page component. Provides `InvoiceStore` locally.

**Inputs:**
- `listId: string` — initial filter mode (`'all'`, `'my'`, or personKey)
- `contextMenuName: string` — name of the context menu (popover)

**Person filter:**
- Toolbar button opens `PersonSelectModalComponent` to filter by person
- Selected person name shown as chip with ×-clear button
- Sets `store.listId` to the person's bkey

**Context menu (popover):**
| Key | Action |
|---|---|
| `add` | Opens `InvoiceEditModal` in create mode |
| `exportRaw` | Exports visible invoices to XLSX |

**ActionSheet per invoice:**
| Action | Role required |
|---|---|
| `invoice.view` | any authenticated user |
| `invoice.edit` | `treasurer` or `privileged` |
| `invoice.delete` | `admin` |

### `InvoiceEditModal` (`bk-invoice-edit-modal`)

Modal for creating and editing invoices.

**Inputs:** `invoice`, `currentUser`, `isNew`, `readOnly`  
**Dismiss roles:** `'confirm'` (with updated model) or `'cancel'`

### `InvoiceAccordion` (`bk-invoice-accordion`)

Collapsed accordion for use in the user profile. Shows the current user's own invoices (`listId = 'my'`). Provides `InvoiceStore` locally.

## Store (`InvoiceStore`)

State:
```typescript
type InvoiceState = {
  listId: string;         // 'all' | 'my' | personKey
  searchTerm: string;
  selectedState: string;  // 'all' | 'draft' | 'pending' | 'paid' | 'cancelled'
  version: number;        // bump to force rxResource reload
};
```

Methods: `setListId`, `setSearchTerm`, `setSelectedState`, `add`, `edit`, `delete`, `export`

## Util functions (`@bk2/finance-invoice-util`)

| Function | Description |
|---|---|
| `newInvoice(tenantId)` | Creates a new `InvoiceModel` |
| `getInvoiceIndex(invoice)` | Builds the searchable index string |
| `getInvoiceExportData(invoices)` | Returns `string[][]` for XLSX export |
| `invoiceValidations` | Vest validation suite |

## Usage examples

```html
<!-- Standalone list page -->
<bk-invoice-list listId="all" contextMenuName="invoice-list-menu" />

<!-- User profile accordion -->
<ion-accordion-group>
  <bk-invoice-accordion />
</ion-accordion-group>
```
