// Readers load this barrel at once, the canvas of the editor must stay out of it:
// - never import() this barrel, and never use a component of it only inside @defer (the Angular compiler turns that into an import());
// - only `export *` and `export type` here: an `export { x } from` that is used makes the barrel itself part of the bundle.
// Either one makes everything below eager. ESLint refuses them; what is lazy has a loader function here.

// readers
export * from './lib/article-carousel';
export * from './lib/article-frame';
export * from './lib/article-images';
export * from './lib/article-slideshow';
export * from './lib/section-link';
// not the component, only its loader; the type is for whoever creates it
export * from './lib/article-blocks.loader';
export type { ArticleBlocks } from './lib/article-blocks';
// the editor of a Versand mail: only its loader, for the composer
export * from './lib/mail-editor.loader';
export type { MailEditorHost } from './lib/mail-editor-host';

// editors: only lazily loaded files (the article editor) import these, so that readers load none of it
export * from './lib/article-canvas';
export * from './lib/article-canvas.util';
export * from './lib/article-editor-surface';
export * from './lib/article-editor-surface.util';
