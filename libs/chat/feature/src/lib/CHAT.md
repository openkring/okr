# Chat (Matrix Chat) Domain

## Overview

The Chat domain integrates a [Matrix](https://matrix.org/) homeserver into the application, providing real-time messaging with rooms, threads, reactions, message editing/deletion, and embedded media. Firebase Authentication is bridged to Matrix via a Firebase Cloud Function (`getMatrixCredentials`) that exchanges a Firebase ID token for Matrix credentials.

No Firestore collection is used by the chat feature itself — Matrix state is held server-side on the homeserver and mirrored into the Angular client via `matrix-js-sdk`.

## Authentication Flow

1. On first login, `MatrixInitializationService.startEarlyInitialization()` watches `AppStore.currentUser`.
2. Once a user is authenticated, it calls the `getMatrixCredentials` Cloud Function (via `httpsCallable`).
3. The function returns a `MatrixAuthToken` (`accessToken`, `userId`, `deviceId`, `homeserverUrl`).
4. `MatrixChatService.initialize(token)` creates and starts a `matrix-js-sdk` client.
5. The `isMatrixInitialized` flag propagates through `_MatrixChatStore` so dependent resources re-fire automatically.

For detailed auth strategy options see `FIREBASE_MATRIX_AUTH_APPROACHES.md`.
For OIDC bridge configuration see `OIDC_BRIDGE_SETUP.md`.

## Matrix Data Types (not persisted in Firestore)

| Type | Description |
|---|---|
| `MatrixRoom` | roomId, name, avatar, topic, isDirect, unreadCount, lastMessage, members, typingUsers |
| `MatrixMessage` | eventId, roomId, sender, senderName, body, timestamp, type, content, mediaUrl, relatesTo, reactions, isRedacted, isEdited |
| `MatrixMember` | userId, displayName, avatarUrl, membership |
| `MatrixUser` | id (Matrix @user:homeserver), name, imageUrl |
| `MatrixAuthToken` | accessToken, userId, deviceId, homeserverUrl |
| `MatrixConfig` | homeserverUrl, userId?, accessToken?, deviceId? |

## MatrixChatStore (`_MatrixChatStore`)

NgRx Signal Store (provided at component level). State:

| State field | Description |
|---|---|
| `isMatrixInitialized` | Whether the matrix-js-sdk client has been started |
| `currentRoomId` | Currently viewed room ID |
| `selectedThreadId` | Thread root event ID when browsing a thread |
| `replyToMessage` | The message being replied to (inline reply) |

Key `rxResource` bindings (all backed by `MatrixChatService` Observables):

| Resource | Description |
|---|---|
| `syncStateResource` | Matrix sync state (PREPARED, SYNCING, etc.) |
| `roomsResource` | List of `MatrixRoom` objects |
| `messagesResource` | Messages for `currentRoomId`; re-fires when room or init state changes |
| `imageUrlResource` | Resolved imgix URL for the current user's avatar |
| `activeCallResource` | Active Matrix call (if any) |
| `callStateResource` | Call state signal |
| `callFeedsResource` | Call media feeds |
| `typingResource` | Typing notifications per room |

Key actions (withMethods):
- `setCurrentRoom(roomId)` — navigate to a room.
- `sendMessage(roomId, body)` — send a plain text message.
- `sendReaction(roomId, eventId, emoji)` — react to a message.
- `editMessage(roomId, eventId, newBody)` — edit a sent message.
- `deleteMessage(roomId, eventId)` — redact a message.
- `createRoom(options)` / `editRoom(roomId)` — room management via `RoomEditModal`.
- `inviteUser(roomId)` / `leaveRoom(roomId)` — membership management.
- `setReplying(message)` / `clearReply()` — in-reply-to state.
- `selectThread(eventId)` / `clearThread()` — thread navigation.

## MatrixInitializationService

Singleton service (`providedIn: 'root'`). Called once from `APP_BOOTSTRAP_LISTENER`.

- Watches `AppStore.currentUser` and calls `initializeMatrix()` on first authenticated user.
- Calls `getMatrixCredentials` Cloud Function via `httpsCallable`.
- Registers device for FCM push notifications on native platforms (Capacitor).
- Handles navigation back to chat after token refresh.

## RoomEditModal

Modal form for creating and editing Matrix rooms. Props: `roomId` (undefined = create new), `currentUser`.

## MatrixChatComponent (`matrix-chat.ts`)

Main chat UI component. Uses the `_MatrixChatStore` to render the room list, message thread, and toolbar.

## Cloud Functions

| Function | Description |
|---|---|
| `getMatrixCredentials` | Exchanges Firebase ID token for Matrix access credentials; caches tokens; lives in `apps/functions/src/matrix/` |

## Related Libraries

| Library | Path |
|---|---|
| `@bk2/chat-data-access` | `MatrixChatService` — matrix-js-sdk wrapper with Observable streams |
| `@bk2/chat-util` | Helpers: `formatMatrixTimestamp`, `isMatrixPhotoUrl`, etc. |

## Library Path

`@bk2/chat-feature` (`libs/chat/feature/src/lib/`)
