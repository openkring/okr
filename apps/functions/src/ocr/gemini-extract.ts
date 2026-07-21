import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs/promises';
import { logger } from 'firebase-functions/v2';

import { OCR_RESPONSE_SCHEMA, buildOcrPrompt, type OcrRawExtraction } from './ocr-schema';
import type { OcrUsage } from './ocr-path.util';

// GA multimodal model (accepts PDF/image). Kept in one place; can be aligned with rag/index.ts RAG_MODEL.
export const OCR_MODEL = 'gemini-2.5-flash';

/**
 * Run Gemini multimodal extraction on a local file. Inline base64 (recommended for ≤~20MB single-shot).
 * Returns the parsed raw extraction, or throws on an empty/invalid response.
 */
export async function geminiExtract(
  apiKey: string,
  localPath: string,
  mimeType: string,
  usage: OcrUsage,
  accountList: string,
): Promise<OcrRawExtraction> {
  const ai = new GoogleGenAI({ apiKey });
  const base64 = (await fs.readFile(localPath)).toString('base64');

  const response = await ai.models.generateContent({
    model: OCR_MODEL,
    contents: [
      { inlineData: { mimeType: mimeType || 'application/pdf', data: base64 } },
      buildOcrPrompt(usage, accountList),
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: OCR_RESPONSE_SCHEMA,
    },
  });

  const raw = response.text;
  if (!raw) throw new Error('Gemini returned an empty response');
  logger.debug('geminiExtract: raw response', { raw });
  return JSON.parse(raw) as OcrRawExtraction;
}
