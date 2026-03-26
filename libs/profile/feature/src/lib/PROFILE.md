# Profile Domain

## Overview
The profile domain allows the currently authenticated user to view and edit their own personal data and application settings. It combines editing a `PersonModel` (personal details) and a `UserModel` (application preferences and privacy settings) in a single page. The user is always the subject of this page — there is no `readOnly` mode.

The profile page also surfaces the user's own addresses (via `AddressesAccordionComponent`) and supports avatar photo upload.

## Firestore Collections Used
| Collection | Model | Access |
|---|---|---|
| `persons` | `PersonModel` | Read own record by `currentUser.personKey`; update via `FirestoreService.updateModel` |
| `users` | `UserModel` | Read + update own record |

## Store: `ProfileEditStore`
NgRx Signal Store (`@ngrx/signals`). Provided at the `ProfileEditPageComponent` level.

### State
| Property | Type | Description |
|---|---|---|
| `personKey` | string \| undefined | Key of the current user's linked person; set via `effect` from `currentUser.personKey` |

### Computed Signals
| Signal | Source | Description |
|---|---|---|
| `person` | `personResource` | The linked `PersonModel` for the current user |
| `currentUser` | `AppStore.currentUser()` | The current `UserModel` |
| `tenantId` | `AppStore.env.tenantId` | Current tenant ID |
| `privacySettings` | `AppStore.privacySettings()` | Tenant-level privacy configuration |
| `isLoading` | `personResource.isLoading()` | Loading state for the person resource |

### Key Methods
| Method | Description |
|---|---|
| `setPersonKey(key)` | Sets the person key and triggers person resource reload |
| `save(person, user)` | Saves both `PersonModel` and `UserModel`; formats AHV number to electronic format before saving person; shows a single confirmation toast |
| `saveAvatar(photo)` | Uploads a Capacitor camera photo as the person's avatar |

## Component: `ProfileEditPageComponent`
Route: typically `/profile` (registered users only).

The page uses two independent `linkedSignal` instances to track unsaved changes:
- `personFormData` — mirrors `profileEditStore.person()`
- `userFormData` — mirrors `profileEditStore.currentUser()`

Both signals feed into a shared `formDirty` / `formValid` state to control the `ChangeConfirmationComponent` banner.

### Sections (Accordion Layout)
| Section | Component | Description |
|---|---|---|
| Avatar | `AvatarToolbarComponent` | Shows person avatar + name/email; supports photo upload |
| Personal data | `ProfileDataAccordionComponent` | Edit `PersonModel` fields (name, gender, birthday, AHV, address snapshot) |
| Addresses | `AddressesAccordionComponent` | Manage the person's addresses (parentKey = `person.<personKey>`) |
| Settings | `ProfileSettingsAccordionComponent` | Edit `UserModel` app preferences (language, display, delivery, biometrics) |
| Privacy | `ProfilePrivacyAccordionComponent` | Edit `UserModel` privacy usage settings per data category |

### Save Behaviour
On save, `ProfileEditStore.save(person, user)` is called with both the current `personFormData` and `userFormData`. The store updates them independently in Firestore:
- `PersonModel` via `FirestoreService.updateModel<PersonModel>` (no toast, no comment)
- `UserModel` via `FirestoreService.updateModel<UserModel>` (with `@profile.operation.update` toast)

### Cancel Behaviour
Both `personFormData` and `userFormData` are reset to their current store values. The form component tree is destroyed and recreated (via toggling `showForm`) to fully reset Vest validation state.

## Authorization
- Accessible to any authenticated user (`isAuthenticatedGuard`)
- Always editable (no `readOnly` mode); the user always edits their own profile
- AHV number visibility is subject to `privacySettings`
