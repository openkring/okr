import type { Worker } from 'tesseract.js';

import { cleanOcrText, isReadableBlock, Rect } from '@okr/instruments-translator-util';

/** One recognised paragraph, its box in the pixels of the image that was recognised. */
export interface OcrBlock {
  text: string;
  box: Rect;
  /** Lines of the paragraph, to size the overlay's font. */
  lines: number;
}

/**
 * On-device text recognition for the live view (idea 2.126 phase 2): tesseract.js in a web worker,
 * loaded on first use only (dynamic import — the library is not in the eager bundle). The worker and
 * the WASM core are served from the app's `assets/tesseract/`, the language models from Storage
 * through imgix (`tesseract/4.0.0_best_int/<model>.traineddata.gz`, uploaded by
 * `scripts/upload-tesseract-models.mjs`); tesseract.js keeps a loaded model in IndexedDB. The camera
 * image never leaves the device.
 */
export class LiveOcr {
  private worker: Worker | undefined;
  private models = '';

  constructor(private readonly imgixBaseUrl: string) {}

  /** Loads (or switches to) the given `+`-joined models, e.g. `deu+eng`. */
  public async load(models: string): Promise<void> {
    const { createWorker, OEM } = await import('tesseract.js');
    if (!this.worker) {
      const assets = new URL('assets/tesseract/', document.baseURI).href;
      this.worker = await createWorker(models, OEM.LSTM_ONLY, {
        workerPath: assets + 'worker.min.js',
        corePath: assets,
        langPath: `${this.imgixBaseUrl}/tesseract/4.0.0_best_int`,
        workerBlobURL: false,
        gzip: true,
      });
    } else if (models !== this.models) {
      await this.worker.reinitialize(models, OEM.LSTM_ONLY);
    }
    this.models = models;
  }

  /** The readable paragraphs of an image; boxes in the image's pixels. */
  public async recognize(image: HTMLCanvasElement): Promise<OcrBlock[]> {
    if (!this.worker) return [];
    const { data } = await this.worker.recognize(image, {}, { blocks: true, text: false });
    const out: OcrBlock[] = [];
    for (const block of data.blocks ?? []) {
      for (const p of block.paragraphs) {
        const text = cleanOcrText(p.text);
        if (!isReadableBlock(text, p.confidence)) continue;
        out.push({ text, lines: Math.max(1, p.lines.length), box: { x: p.bbox.x0, y: p.bbox.y0, w: p.bbox.x1 - p.bbox.x0, h: p.bbox.y1 - p.bbox.y0 } });
      }
    }
    return out;
  }

  public async terminate(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    this.models = '';
    await worker?.terminate().catch(() => undefined);
  }
}
