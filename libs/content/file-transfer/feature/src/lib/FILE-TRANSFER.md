# File transfer (Schnellübertragung)

Spec: `planning/specs/2026-10-22-learning-media-sharing-spec.md` (TOC 1.115, part 1).

A registered member sends one or more large files to groups, single members and outside email
addresses. Files live in the private bucket for a limited lifetime; every open and download is
logged permanently (no IP addresses).

## Libraries

| Lib | Holds |
| --- | --- |
| `@okr/content-file-transfer-util` | wire types, limits, flags, event summaries, Vest suites, i18n keys and the five language files |
| `@okr/content-file-transfer-data-access` | `FileTransferService` (callables, Firestore lists, public link API) and `uploadResumable` |
| `@okr/content-file-transfer-ui` | send form + modal, info modal, card, limits form + modal, log modal |
| `@okr/content-file-transfer-feature` | `FileTransferStore`, the list, the monitor, the view and public pages, the upload modal |

Cloud Functions: `apps/functions/src/file-transfer/` (callables, reaper) and
`apps/functions/src/publicApi/routes/file-transfer.ts` (personal link API).

## Routes

| Route | Component | Guard |
| --- | --- | --- |
| `/private/file-transfer` | `FileTransferList` («Meine Transfers») | signed in |
| `/private/file-transfer/:transferKey` | `FileTransferViewPage` | signed in; the callable admits sender, recipients and admins |
| `/private/file-transfer-monitor` | `FileTransferMonitor` (Transfer-Überwachung) | admin |
| `/public/file-transfer/:token` | `FileTransferPublicPage` | none (the token is the credential) |

The block `file-transfer` is listed before `cms` in `FEATURE_ROUTES`: otherwise the `cms`
catch-alls under `private` and `public` would render these paths as CMS pages.

## Sending

`FileTransferStore.openNew(preset?, chatRoomId?)` opens the send modal; «Senden» runs
`send(form, chatRoomId)`:

1. `prepareFileTransferUpload` checks the limits and returns one resumable session per file.
2. `FileTransferUploadModal` uploads the files one after the other with a progress bar per file.
   Closing it aborts the upload.
3. `sendFileTransfer` checks the real (deduplicated) recipients again and notifies them.

Any failure after step 1 leaves the transfer in state `uploading`; the hourly reaper removes it
and its files. The store is provided in root so the chat can open the send modal through a lazy
import of this lib.

## Opening files

The card emits `open` with the file and `inline`/`attachment`. `openFileTransferFile` fetches a
short-lived signed URL: an inline video plays in a `<video>` on the page, an inline image or PDF
opens in a tab opened before the await (Safari blocks a later `window.open`), a download
navigates to the URL (the response says `attachment`, so the page stays). The helper lives in
`@okr/content-file-transfer-util` because the chat calls it too (with `videoInTab`, no player).

## In the chat

- **Card:** a group-room card is an `m.text` with `org.okr.fileTransfer: { transferKey }`, posted
  by the workflow bot (`@okrbot`, `postGroupChatMessage`). Only a message from that bot becomes a
  card (`fileTransferCardOf` in `@okr/chat-util`). The same field from anybody else stays a plain
  message, so a forged card neither loads a transfer nor hides its text. The bot's body is hidden
  only when it is the server's exact one-line card text.
- **Loading:** `MatrixChatStore` loads each card once per person and session through
  `getFileTransfer` (expired or not found → «abgelaufen»; another failure retries on the next view
  change) and opens files with `openFileTransferFile`. The message list only renders
  `FileTransferCard`.
- **Starting a transfer:** «Als Transfer senden» is offered in the room's MAIN composer only (not
  the thread pane, not the pending ask room). A video over the chat cap (`MAX_CHAT_VIDEO_BYTES`,
  100 MB — album uploads keep `MAX_VIDEO_BYTES`, 200 MB) gets ONE offer per pick, after a read
  probe right after the pick (stale iOS handles get the «zu gross» toast). Both open `openNew`
  through a dynamic import of this lib: a group room presets its group and gets the card; a DM or
  ad-hoc chat presets its members except the sender, and no card is posted.

## Monitor

All transfers of the tenant with sender, size, members/outside counts, expiry, opens and
downloads, plus the flags from `fileTransferFlags` (relative to the sender's own limits).
Access counts are read once per row, automatically only for open transfers, otherwise when the
admin opens the log — never one listener per row, because the log grows forever.

«Absender kontaktieren» opens a chat direct message (find-or-create). There is no email
fallback: the sender's address is not on the transfer document (addresses are the PII vault).

«Limiten bearbeiten» writes `app-config/{tenantId}.fileTransferLimits` through
`AppConfigService.setFileTransferLimits` (single-field patch).

## Privacy

Gate walked 2026-10-22, full outcome in spec §7.1.

- **Read access:** `file-transfers` and `file-transfer-events` are readable by the sender and
  tenant admins only; everything else goes through callables. The public link view shows sender
  name, message, files and expiry, nothing about other recipients.
- **Personal links:** the token is never stored (only its hash) and there is no short alias link:
  an alias document is tenant-readable and would hand every recipient's bearer link to the whole
  tenant. The direct `/public/file-transfer/<token>` URL goes out in the notification only.
- **No IPs:** the rate limit keys its counters by a hash of the IP; events carry keys only.
- **Retention:** files go at expiry or end; the log is permanent. Outside addresses stay in it.
- **Erasure:** `SUBJECT_DATA_MAP` rows (`apps/functions/src/privacy/subject-data-map.ts`). The
  sender's `senderName` is pseudonymised; as a recipient of someone else's transfer the member's
  element in `recipients[]` loses `name`/`email` through the row's `anonymizeArrayItems` option
  (keys and token hash stay, no document-level `anonymizedAt`); the erasure preview counts those
  transfers under «Das wird anonymisiert». Events are retained as they hold keys only. Open: the data
  export does not list transfers where the member is only a recipient.

## Menu

Catalogue-owned rows of the `file-transfer` block: `file-transfer` («Transfer», registered) and
`file-transfer-monitor` («Transfer-Überwachung», admin). Labels live in the menu lib
(`libs/cms/menu/feature/src/i18n`). The rows appear after an admin ticks the block in
`/tenant/features`; that needs the functions deploy that carries the new catalogue.
