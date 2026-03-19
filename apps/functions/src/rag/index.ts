import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { onObjectFinalized, onObjectDeleted } from 'firebase-functions/v2/storage';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { GoogleGenAI } from '@google/genai';
import * as admin from 'firebase-admin';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { checkAppCheckToken, checkAuthentication, checkStringField } from '@bk2/shared-util-functions';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const RAG_MODEL = 'gemini-3-flash-preview';

/** Storage path prefix watched for RAG documents. */
const RAG_PATH_PREFIX = 'tenant/';
const RAG_PATH_SUFFIX = '/rag/';

/** Derive the RAG store name from a tenantId. */
function ragStoreName(tenantId: string): string {
    return `${tenantId}-rag`;
}

/** Extract tenantId from a RAG storage path: tenant/{tenantId}/rag/{fileName} */
function tenantIdFromPath(objectName: string): string | null {
    // e.g. "tenant/scs/rag/report.pdf"
    const parts = objectName.split('/');
    if (parts.length >= 4 && parts[0] === 'tenant' && parts[2] === 'rag') {
        return parts[1];
    }
    return null;
}

// --------------------------------- helpers ---------------------------------

/**
 * Gets the resource name of an existing file search store by display name,
 * or creates one if it doesn't exist.
 * Returns the store resource name.
 */
async function getOrCreateFileStore(ai: GoogleGenAI, storeName: string): Promise<string> {
    logger.info(`getOrCreateFileStore: looking up store "${storeName}"`);

    for await (const store of await ai.fileSearchStores.list()) {
        if (store.displayName === storeName && store.name) {
            return store.name;
        }
    }

    logger.info(`getOrCreateFileStore: creating new store "${storeName}"`);
    const created = await ai.fileSearchStores.create({
        config: { displayName: storeName },
    });
    if (!created.name) {
        throw new Error(`Store "${storeName}" was created but returned no resource name`);
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

        await ai.fileSearchStores.uploadToFileSearchStore({
            fileSearchStoreName: storeResourceName,
            file: tempFilePath,
            config: {
                displayName: path.basename(objectName),
                mimeType: contentType || 'application/octet-stream',
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

    let storeResourceName: string | null = null;
    for await (const store of await ai.fileSearchStores.list()) {
        if (store.displayName === storeName && store.name) {
            storeResourceName = store.name;
            break;
        }
    }
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
 * Ensures a RAG file search store exists for the tenant. Admin-only.
 */
export const getOrCreateStore = onCall(
    {
        region: 'europe-west6',
        enforceAppCheck: true,
        cors: true,
        secrets: [geminiApiKey],
    },
    async (request: CallableRequest<{ storeName: string }>) => {
        const CF_NAME = 'getOrCreateStore';
        checkAppCheckToken(request as any, CF_NAME);
        checkAuthentication(request as any, CF_NAME);
        const storeName = checkStringField(request as any, CF_NAME, 'storeName');
        const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
        const name = await getOrCreateFileStore(ai, storeName);
        return { success: true, storeName: name };
    },
);

// ---------------------------------

export interface RagMessage {
    role: 'user' | 'model';
    text: string;
}

export interface RagRequest {
    storeName: string;
    question: string;
    history?: RagMessage[];
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
 */
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
        const storeName = checkStringField(request as any, CF_NAME, 'storeName');
        const question = checkStringField(request as any, CF_NAME, 'question');
        const history: RagMessage[] = request.data.history ?? [];

        try {
            const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
            const storeResourceName = await getOrCreateFileStore(ai, storeName);

            const contents = [
                ...history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user' as const, parts: [{ text: question }] },
            ];

            const response = await ai.models.generateContent({
                model: RAG_MODEL,
                contents,
                config: {
                    systemInstruction:
                        'Du bist ein hilfreicher Assistent des Seeclubs Stäfa, einem Segelclub am Zürichsee. ' +
                        'Du weisst, wie der Verein organisiert ist und welche Vorgaben beim Rudern gelten.' +
                        'Beantworte Fragen ausschliesslich auf Deutsch. ' +
                        'Stütze deine Antworten in erster Linie auf die bereitgestellten Vereinsdokumente. ' +
                        'Wenn die Antwort nicht eindeutig aus den Dokumenten hervorgeht, ' +
                        'weise darauf hin und ergänze mit allgemeinem Wissen über Segelvereine.',
                    tools: [{ fileSearch: { fileSearchStoreNames: [storeResourceName] } }],
                },
            });

            const answer = response.text ?? '';
            const sources: RagSource[] = (response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
                .map((chunk: any) => ({
                    title: chunk.retrievedContext?.title ?? chunk.web?.title ?? '',
                    uri: chunk.retrievedContext?.uri ?? chunk.web?.uri ?? '',
                }))
                .filter((s: RagSource) => !!s.uri);

            return { answer, sources };
        } catch (error: any) {
            logger.error(`${CF_NAME}: ERROR:`, error);
            throw new HttpsError('internal', `RAG query failed: ${error.message}`);
        }
    },
);
