import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized, onObjectDeleted } from 'firebase-functions/v2/storage';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { GoogleGenAI } from '@google/genai';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { checkAdminRole, checkAppCheckToken, checkAuthentication, checkStringField, getCallerTenantId } from '@okr/shared-util-functions';
import { checkWindowQuota, getMonthlyCount, incrementMonthlyCount } from '../_gateway/quota';
import { AppConfigCollection, SectionCollection } from '@okr/shared-models';
import {
    defaultSystemPrompt,
    ragStoreName,
    resolveMaxOutputTokens,
    resolveModel,
    SCOPE_METADATA_KEY,
    scopeFromPath,
    scopeMetadataFilter,
    tenantIdFromPath,
} from './rag-config.util';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

// --------------------------------- helpers ---------------------------------

/**
 * Resource name of an existing file search store, by display name, or null if there is
 * none. Read paths use this rather than `getOrCreateFileStore`: a query must never mint
 * a store as a side effect.
 */
async function findFileStore(ai: GoogleGenAI, storeName: string): Promise<string | null> {
    for await (const store of await ai.fileSearchStores.list()) {
        if (store.displayName === storeName && store.name) {
            return store.name;
        }
    }
    return null;
}

/**
 * Gets the resource name of an existing file search store by display name,
 * or creates one if it doesn't exist.
 * Returns the store resource name.
 */
async function getOrCreateFileStore(ai: GoogleGenAI, storeName: string): Promise<string> {
    logger.info(`getOrCreateFileStore: looking up store "${storeName}"`);

    const existing = await findFileStore(ai, storeName);
    if (existing) return existing;

    logger.info(`getOrCreateFileStore: creating new store "${storeName}"`);
    const created = await ai.fileSearchStores.create({
        config: { displayName: storeName },
    });
    if (!created.name) {
        throw new HttpsError('internal', `Store "${storeName}" was created but returned no resource name`);
    }
    return created.name;
}

/**
 * Download a file from Firebase Storage to a temp path and index it in the RAG File Search store.
 */
async function indexStorageFile(
    ai: GoogleGenAI,
    bucketName: string,
    objectName: string,
    contentType: string,
    tenantId: string,
): Promise<void> {
    const storeName = ragStoreName(tenantId);
    const storeResourceName = await getOrCreateFileStore(ai, storeName);

    const bucket = admin.storage().bucket(bucketName);
    const file = bucket.file(objectName);
    const tempFilePath = path.join(tmpdir(), path.basename(objectName));

    try {
        await file.download({ destination: tempFilePath });

        // Index the folder path as `scope` metadata so a section can restrict retrieval via
        // RagConfig.documentScope. Files uploaded flat into rag/ carry no scope and are
        // therefore only reachable by an unscoped section — which is every section today.
        const scope = scopeFromPath(objectName);

        await ai.fileSearchStores.uploadToFileSearchStore({
            fileSearchStoreName: storeResourceName,
            file: tempFilePath,
            config: {
                displayName: path.basename(objectName),
                mimeType: contentType || 'application/octet-stream',
                ...(scope !== '' ? { customMetadata: [{ key: SCOPE_METADATA_KEY, stringValue: scope }] } : {}),
            },
        });

        logger.info(`indexStorageFile: indexed "${objectName}" into store "${storeName}"`);
    } finally {
        await fs.unlink(tempFilePath).catch(() => undefined);
    }
}

/**
 * Remove a file from the RAG File Search store by display name match.
 */
async function removeFromFileStore(
    ai: GoogleGenAI,
    objectName: string,
    tenantId: string,
): Promise<void> {
    const storeName = ragStoreName(tenantId);
    const displayName = path.basename(objectName);

    const storeResourceName = await findFileStore(ai, storeName);
    if (!storeResourceName) {
        logger.warn(`removeFromFileStore: store "${storeName}" not found, skipping`);
        return;
    }

    // List documents in the store and delete the matching one via REST (SDK has no delete method)
    for await (const storeFile of await ai.fileSearchStores.documents.list({ parent: storeResourceName })) {
        if (storeFile.displayName === displayName && storeFile.name) {
            const apiKey = geminiApiKey.value();
            await axios.delete(
                `https://generativelanguage.googleapis.com/v1beta/${storeFile.name}?key=${apiKey}`,
            );
            logger.info(`removeFromFileStore: removed "${displayName}" from store "${storeName}"`);
            return;
        }
    }

    logger.warn(`removeFromFileStore: file "${displayName}" not found in store "${storeName}"`);
}

// --------------------------------- Storage triggers ---------------------------------

/**
 * Automatically index a file into the RAG store when it is uploaded to
 * tenant/{tenantId}/rag/{fileName} in Firebase Storage.
 */
export const onRagFileCreated = onObjectFinalized(
    {
        region: 'europe-west6',
        secrets: [geminiApiKey],
    },
    async (event) => {
        const objectName = event.data.name;
        const bucketName = event.data.bucket;
        const contentType = event.data.contentType ?? 'application/octet-stream';

        const tenantId = tenantIdFromPath(objectName);
        if (!tenantId) {
            // Not a RAG path — ignore silently
            return;
        }

        logger.info(`onRagFileCreated: "${objectName}" (${contentType})`);

        try {
            const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
            await indexStorageFile(ai, bucketName, objectName, contentType, tenantId);
        } catch (error: any) {
            logger.error(`onRagFileCreated: failed to index "${objectName}":`, error);
        }
    },
);

/**
 * Remove a file from the RAG store when it is deleted from
 * tenant/{tenantId}/rag/{fileName} in Firebase Storage.
 */
export const onRagFileDeleted = onObjectDeleted(
    {
        region: 'europe-west6',
        secrets: [geminiApiKey],
    },
    async (event) => {
        const objectName = event.data.name;

        const tenantId = tenantIdFromPath(objectName);
        if (!tenantId) return;

        logger.info(`onRagFileDeleted: "${objectName}"`);

        try {
            const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
            await removeFromFileStore(ai, objectName, tenantId);
        } catch (error: any) {
            logger.error(`onRagFileDeleted: failed to remove "${objectName}":`, error);
        }
    },
);

// --------------------------------- onCall functions ---------------------------------

/**
 * Ensures a RAG file search store exists for the caller's own tenant. Admin-only.
 *
 * Provisioning escape hatch: the storage trigger creates the store on the first upload,
 * so this only matters when an admin wants the store to exist beforehand. It takes no
 * store name — the name is derived from the caller's tenant, so an admin of tenant A
 * cannot reach into tenant B.
 */
export const getOrCreateStore = onCall(
    {
        region: 'europe-west6',
        enforceAppCheck: true,
        cors: true,
        secrets: [geminiApiKey],
    },
    async (request: CallableRequest<void>) => {
        const CF_NAME = 'getOrCreateStore';
        checkAppCheckToken(request as any, CF_NAME);
        await checkAdminRole(request as any, CF_NAME);
        const tenantId = await getCallerTenantId(request as any, CF_NAME);
        const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
        const name = await getOrCreateFileStore(ai, ragStoreName(tenantId));
        return { success: true, storeName: name };
    },
);

// ---------------------------------

export interface RagMessage {
    role: 'user' | 'model';
    text: string;
}

export interface RagRequest {
    /**
     * @deprecated Ignored. The store is derived server-side from the caller's tenant.
     * Kept in the shape only so the released client, which still sends the CMS-configured
     * `RagConfig.storeName`, keeps type-checking; drop it once no client sends it.
     */
    storeName?: string;
    /**
     * Key of the `sections` document whose `RagConfig` (model, systemPrompt, documentScope,
     * maxTokens) drives this query. The config is read server-side from Firestore, never
     * taken from the request: `systemPrompt` and `model` decide what the assistant does and
     * what it costs, so they must come from the admin-authored CMS document rather than
     * from whoever is typing in the chat box. Absent (pre-release client) → defaults.
     */
    sectionKey?: string;
    question: string;
    history?: RagMessage[];
}

/** The subset of `RagConfig` the callable applies, resolved and bounded. */
interface ResolvedRagConfig {
    model: string;
    systemPrompt: string;
    metadataFilter?: string;
    maxOutputTokens?: number;
}

/**
 * Load the section's `RagConfig` and fold it into what the query actually uses. The section
 * must belong to the caller's tenant — otherwise a member could name another tenant's
 * section and read its prompt. An unknown/foreign/non-rag key degrades to the defaults
 * rather than failing: the chat keeps working, it just loses the tailoring.
 */
async function resolveConfig(tenantId: string, sectionKey: string | undefined): Promise<ResolvedRagConfig> {
    const db = getFirestore();
    const configSnap = await db.collection(AppConfigCollection).doc(tenantId).get();
    const tenantName = String(configSnap.data()?.['appName'] ?? tenantId);

    let properties: Record<string, unknown> = {};
    if (sectionKey) {
        const snap = await db.collection(SectionCollection).doc(sectionKey).get();
        const section = snap.data();
        const tenants = Array.isArray(section?.['tenants']) ? (section['tenants'] as string[]) : [];
        if (!section || section['type'] !== 'rag' || !tenants.includes(tenantId)) {
            logger.warn(`queryRag: section "${sectionKey}" is not a rag section of tenant ${tenantId} — using defaults`);
        } else {
            properties = (section['properties'] as Record<string, unknown>) ?? {};
        }
    }

    const systemPrompt = typeof properties['systemPrompt'] === 'string' && properties['systemPrompt'].trim() !== ''
        ? properties['systemPrompt']
        : defaultSystemPrompt(tenantName);

    return {
        model: resolveModel(properties['model']),
        systemPrompt,
        metadataFilter: scopeMetadataFilter(properties['documentScope']),
        maxOutputTokens: resolveMaxOutputTokens(properties['maxTokens']),
    };
}

export interface RagSource {
    title: string;
    uri: string;
}

export interface RagResponse {
    answer: string;
    sources: RagSource[];
}

/**
 * Queries the RAG store using Google File Search and returns an answer with citations.
 * Authenticated users only (no admin role required).
 *
 * The store is derived from the CALLER'S OWN tenant (`users/{uid}.tenants[0]`), never from
 * `request.data`. The callable used to pass the client's `storeName` straight through, so
 * any authenticated user could send another tenant's store name (`{tenantId}-rag` is
 * guessable) and read that tenant's indexed documents. Do not reintroduce a store or
 * tenant parameter here.
 */
/**
 * Quota layer (1.18, standalone). `rag` is NOT a `ProviderAdapter` retrofit: it goes through
 * the `@google/genai` SDK, not the axios wrapper, and caching a generated answer under a
 * hashed prompt buys nothing (queries are near-unique and non-deterministic). What the
 * gateway does give us is the part that matters here — the failure mode of an LLM call is a
 * BILL — so we reuse `_gateway/quota` directly: a per-caller sliding window plus a durable
 * per-provider monthly cap in the same `_apiQuota` collection every other provider uses.
 * No cache means no stale fallback: on a cap breach the only honest answer is to refuse.
 */
const RAG_PROVIDER_ID = 'rag-gemini';
/** Tighter than the gateway's 60/min default — a RAG turn costs orders of magnitude more. */
const RAG_WINDOW = { limit: 10, windowMs: 60_000 };
/** Upstream generateContent calls per month, all tenants. Our key → our bill. */
const RAG_MONTHLY_CAP = 5_000;

export const queryRag = onCall(
    {
        region: 'europe-west6',
        enforceAppCheck: true,
        cors: true,
        secrets: [geminiApiKey],
    },
    async (request: CallableRequest<RagRequest>): Promise<RagResponse> => {
        const CF_NAME = 'queryRag';
        checkAppCheckToken(request as any, CF_NAME);
        checkAuthentication(request as any, CF_NAME);
        const tenantId = await getCallerTenantId(request as any, CF_NAME);
        const storeName = ragStoreName(tenantId);
        const question = checkStringField(request as any, CF_NAME, 'question');
        const history: RagMessage[] = request.data.history ?? [];
        const config = await resolveConfig(tenantId, request.data.sectionKey);

        // Quota: per-caller window first (cheap, throws resource-exhausted), then the
        // monthly cap. Both before the SDK call — that is the one that costs money.
        const nowMs = Date.now();
        await checkWindowQuota(RAG_PROVIDER_ID, { tenantId, uid: request.auth?.uid ?? null, isAdmin: false }, RAG_WINDOW);
        if (await getMonthlyCount(RAG_PROVIDER_ID, nowMs) >= RAG_MONTHLY_CAP) {
            logger.warn(`${CF_NAME}: monthly cap reached`, { cap: RAG_MONTHLY_CAP });
            throw new HttpsError('resource-exhausted',
                'Das monatliche Kontingent für den Assistenten ist aufgebraucht. Bitte nächsten Monat wieder versuchen.');
        }

        try {
            const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
            // Look up only — a query must not create an (empty) store as a side effect.
            const storeResourceName = await findFileStore(ai, storeName);
            if (!storeResourceName) {
                logger.warn(`${CF_NAME}: no RAG store "${storeName}" for tenant ${tenantId}`);
                throw new HttpsError('failed-precondition',
                    'Für diesen Verein sind noch keine Dokumente hinterlegt.');
            }

            const contents = [
                ...history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user' as const, parts: [{ text: question }] },
            ];

            const response = await ai.models.generateContent({
                model: config.model,
                contents,
                config: {
                    systemInstruction: config.systemPrompt,
                    tools: [{
                        fileSearch: {
                            fileSearchStoreNames: [storeResourceName],
                            ...(config.metadataFilter ? { metadataFilter: config.metadataFilter } : {}),
                        },
                    }],
                    ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
                },
            });

            await incrementMonthlyCount(RAG_PROVIDER_ID, nowMs);

            const answer = response.text ?? '';
            const sources: RagSource[] = (response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
                .map((chunk: any) => ({
                    title: chunk.retrievedContext?.title ?? chunk.web?.title ?? '',
                    uri: chunk.retrievedContext?.uri ?? chunk.web?.uri ?? '',
                }))
                .filter((s: RagSource) => !!s.uri);

            return { answer, sources };
        } catch (error: any) {
            if (error instanceof HttpsError) throw error;   // keep the precise code/message
            logger.error(`${CF_NAME}: ERROR:`, error);
            throw new HttpsError('internal', `RAG query failed: ${error.message}`);
        }
    },
);
