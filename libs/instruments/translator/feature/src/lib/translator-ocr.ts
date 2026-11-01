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
 * the WASM core are served from the app's `assets/tesseract/`, the language models straight from the
 * default Storage bucket (public-read objects under `tesseract/4.0.0_best_int/`, uploaded by
 * `scripts/upload-tesseract-models.mjs`) — not through imgix, which would only pass them through and
 * bill the bandwidth. tesseract.js keeps a loaded model in IndexedDB. The camera image never leaves
 * the device.
 */
/** Public GCS URL of the models; tesseract.js appends `/<model>.traineddata.gz`. */
export const TESSERACT_LANG_PATH = 'https://storage.googleapis.com/bkaiser-org.appspot.com/tesseract/4.0.0_best_int';

export class LiveOcr {
  private worker: Worker | undefined;
  private models = '';

  /** Loads (or switches to) the given `+`-joined models, e.g. `deu+eng`. */
  public async load(models: string): Promise<void> {
    const { createWorker, OEM } = await import('tesseract.js');
    if (!this.worker) {
      const assets = new URL('assets/tesseract/', document.baseURI).href;
      this.worker = await createWorker(models, OEM.LSTM_ONLY, {
        workerPath: assets + 'worker.min.js',
        corePath: assets,
        langPath: TESSERACT_LANG_PATH,
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
