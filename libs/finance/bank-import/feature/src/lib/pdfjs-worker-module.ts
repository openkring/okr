/**
 * pdfjs-dist ships no types for its worker entry; importing it only registers `globalThis.pdfjsWorker`.
 * A plain `.ts` script (no import/export) rather than a `.d.ts`: `libs/**\/*.d.ts` is git-ignored as a
 * build artifact. Pulled into every program through the triple-slash reference in pdf-text.util.ts.
 */
declare module 'pdfjs-dist/build/pdf.worker.mjs';
