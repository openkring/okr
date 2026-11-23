// Light half only: these are safe to import statically. The engine (ProseMirror) is reached solely
// through the dynamic imports inside rich-text-input.ts and rich-text-inline.ts — never export it from here (spec 1.170 §6.3).
export * from './lib/rich-text-format';
export * from './lib/rich-text-i18n';
export * from './lib/rich-text-inline';
export * from './lib/rich-text-input';
export * from './lib/rich-text-view';
