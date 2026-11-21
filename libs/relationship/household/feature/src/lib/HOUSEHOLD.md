# Haushalte (households)

## Overview

Persons grouped into a household (Familie, Paar, WG) for one combined Versand and one invoice per household.
Spec: `planning/specs/2026-11-21-households-spec.md` (1.168).

## Firestore collection

`households` — one tenant per household (`tenants` = `[tenantId]`), at most one household per person and tenant.
The client never writes: every write runs through the `saveHousehold` callable (europe-west6).

## Field semantics

| Field | Meaning |
| --- | --- |
| `name` | shown above the contact's address on a combined letter |
| `type` | item of the tenant's category list `household_type` |
| `memberKeys` | personKeys of the persons in the household |
| `payerKey` | person who receives the household invoice (a member) |
| `contactKey` | person who receives a combined Versand (a member) |
| `bundle` | which channels are combined; read with `readBundle` (defaults: post only) |

## Store

`HouseholdStore` (provided in root) — `edit(personKey, mode)` opens the person's household, or for an admin a new
one containing the person, and saves it through the callable; refusals map to a toast via `householdErrorKey`.
Callers outside this lib load it with `await import('@okr/relationship-household-feature')` and `injector.get`.

## Reads

- `HouseholdService.listForPerson` — `memberKeys array-contains`; the rules let a member read their household in
  any tenant, so other tenants' and archived docs are filtered on the client.
- `HouseholdService.listForTenant` — `tenants array-contains` (memberAdmin / privileged), filtered by person on
  the client. An admin cannot use `listForPerson` for somebody else: that query cannot prove the tenant.

## Components

- `HouseholdForm` (`ui`) — name, type, persons (admin), payer, contact, bundle toggles.
- `HouseholdEditModal` (`feature`) — header + change confirmation + form; adds persons through `PersonSelectModal`.
- Person action `person.household` («Haushalt bearbeiten») for memberAdmin / privileged.

## Library path

`libs/relationship/household/{data-access,feature,ui,util}` — `@okr/relationship-household-*`.
