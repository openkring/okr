# Application Architecture Decisions

This file documents non-obvious architectural choices and the reasoning behind them.
It complements CLAUDE.md (which covers conventions and tooling) by focusing on *why*
certain design decisions were made.

---

## RAG Documents — Isolated Storage Model

### Context

The CMS supports a RAG (Retrieval-Augmented Generation) section that lets content admins
upload documents for use in AI-powered Q&A. Documents are stored in Firebase Storage under
`tenant/{tenantId}/rag/` and indexed into Vertex AI via a Storage trigger Cloud Function.

Document management in this app normally uses `DocumentModel.folderKeys: string[]` to support
a many-to-many relationship between documents and folders (deduplication: one file, multiple
folder references). The general `DocumentService.delete()` performs a soft-delete only
(`isArchived = true`) and never touches Storage or Firestore permanently.

### Decision

**RAG documents are treated as a closed, isolated folder — deduplication does not apply.**

- Documents uploaded via the RAG section always have `folderKeys = ['rag']` and are stored
  exclusively at `tenant/{tenantId}/rag/{filename}`.
- They are never associated with other folders, and no other folder's documents are added to
  the RAG folder. This is enforced by the `RagStore.addDocument()` upload flow.
- The `FolderModel` with `bkey = 'rag'` still exists in Firestore for UI consistency (folder
  browser, breadcrumb), but its hierarchy/deduplication semantics are not used.

### Consequences for delete

Because RAG documents are always exclusive to the RAG folder, deleting one means:

1. **Delete the file from Firebase Storage** (`deleteObject`) — this triggers the
   `onObjectDeleted` Cloud Function that de-indexes the file from the Vertex AI RAG store.
2. **Hard-delete the `DocumentModel` from Firestore** (`FirestoreService.deleteObject`) —
   no archiving, no `isArchived` flag.

This is implemented via `DocumentService.hardDelete()`, called from `RagStore.deleteDocument()`.

### Why not use soft-delete?

Soft-deleting (archiving) a RAG document would leave the file in Storage and keep it indexed
in the RAG store, making it continue to influence AI answers. The only correct removal is a
full hard-delete of both the Storage file and the Firestore record.

### Why allow duplicates in the RAG folder?

Enforcing cross-folder deduplication would require moving files between Storage paths when
removing a document from the RAG folder (Firebase Storage has no native move/copy API).
This complexity is avoided entirely by keeping RAG documents isolated. If the same file is
needed in another folder, it should be uploaded separately through the normal document upload
flow.
