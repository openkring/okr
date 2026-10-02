import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenAI, Type } from '@google/genai';

import { ContractDocumentCollection, ContractDocumentRef } from '@okr/shared-models';
import { privateBucket } from '../_storage/private-bucket';
import { OCR_MODEL } from '../ocr/gemini-extract';
import { loadViewer, loadWritableContract } from './caller';
import { pickSummarySource } from './contract-document.util';
import { checkSummarySource, parseSummaryResponse } from './summarize.util';

const geminiApiKey = defineSecret('GEMINI_API_KEY');
const PROMPT = `Du erhältst einen Vertrag. Fasse ihn sachlich auf Deutsch in höchstens 8 Sätzen zusammen:
Parteien, Gegenstand, Laufzeit, Kündigung, Geldbeträge, Besonderheiten. Keine Personendaten ausser Namen
der Parteien. Schlage zusätzlich bis zu 5 kurze Stichworte vor.`;

/** On-demand abstract (spec 1.5 §7.3). Writes nothing: the form shows the proposal for review. */
export const summarizeContract = onCall(
  { region: 'europe-west6', enforceAppCheck: true, cors: true, secrets: [geminiApiKey], timeoutSeconds: 120, memory: '512MiB' },
  async (request: CallableRequest<{ contractKey?: string }>) => {
    const cf = 'summarizeContract';
    const viewer = await loadViewer(request, cf);
    const contractKey = request.data?.contractKey ?? '';
    const { data: contract } = await loadWritableContract(viewer, contractKey, cf);
    // Strict-safe: a missing flag counts as strictly confidential.
    if (contract['isStrictlyConfidential'] !== false) throw new HttpsError('failed-precondition', `${cf}: strictly confidential`);
    const source = pickSummarySource((contract['documents'] as ContractDocumentRef[]) ?? []);
    if (!source) throw new HttpsError('failed-precondition', `${cf}: no contract file`);
    const doc = (await getFirestore().collection(ContractDocumentCollection).doc(source.docKey).get()).data();
    const { fullPath, mimeType } = checkSummarySource(doc, contractKey, viewer.tenantId);
    const [bytes] = await privateBucket().file(fullPath).download();
    const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
    const response = await ai.models.generateContent({
      model: OCR_MODEL,
      contents: [{ inlineData: { mimeType, data: bytes.toString('base64') } }, PROMPT],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: { abstract: { type: Type.STRING }, suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING } } },
          required: ['abstract', 'suggestedTags'],
        },
      },
    });
    return parseSummaryResponse(response.text);
  },
);
