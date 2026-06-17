import { SectionType } from '@bk2/shared-models';

/** Section types that cannot be meaningfully rendered into a static PDF. */
export const PRINT_SKIP_SECTION_TYPES: SectionType[] = ['chat', 'rag', 'form', 'tracker'];

export function isPrintableSectionType(type: SectionType): boolean {
  return !PRINT_SKIP_SECTION_TYPES.includes(type);
}

/** Remove a leading http:// or https:// from a url for display. */
export function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//i, '');
}

/** Curated set of computed-style properties copied onto captured nodes. */
export const PRINT_STYLE_PROPS: string[] = [
  'color', 'background-color',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'text-align', 'text-decoration', 'vertical-align',
  'margin', 'padding', 'border', 'border-radius',
  'display', 'width', 'height', 'max-width', 'list-style',
];

/** Serialize the allowlisted computed-style properties to an inline css string. */
export function serializeComputedStyle(style: CSSStyleDeclaration): string {
  let css = '';
  for (const prop of PRINT_STYLE_PROPS) {
    const value = style.getPropertyValue(prop);
    if (value && value.trim().length > 0) {
      css += `${prop}:${value};`;
    }
  }
  return css;
}

/** Convert a <canvas> (e.g. an ECharts render) to an <img> with a data-url src. */
export function canvasToImg(canvas: HTMLCanvasElement, doc: Document): HTMLImageElement {
  const img = doc.createElement('img');
  img.setAttribute('src', canvas.toDataURL('image/png'));
  img.style.maxWidth = '100%';
  if (canvas.width) img.style.width = `${canvas.width}px`;
  return img;
}

export interface PagePrintSection {
  title: string;
  html: string;
}

export interface PagePrintContext {
  pageTitle: string;
  pageSubtitle: string;
  orgName: string;
  logoUrl: string;
  sourceUrl: string;
  printedDate: string;
}

export interface PagePrintPayload extends PagePrintContext {
  sourceUrlLabel: string;
  sections: PagePrintSection[];
}

/** Build the pre-formatted payload handed to the page-print Handlebars template. */
export function assemblePagePrintPayload(
  ctx: PagePrintContext,
  sections: PagePrintSection[],
): PagePrintPayload {
  return {
    ...ctx,
    sourceUrlLabel: stripProtocol(ctx.sourceUrl),
    sections,
  };
}
