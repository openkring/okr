export * from './lib/crossword.normalize';
// `canPlace` stays internal to the generator — it also collides by name with battleship's.
export { cellsOf } from './lib/crossword.rules';
export type { CrosswordDirection, PlacedWord } from './lib/crossword.rules';
export * from './lib/crossword.generator';
export * from './lib/crossword.validations';
export * from './lib/crossword-i18n';
export * from './lib/crossword.view';
export * from './lib/crossword.progress';
export * from './lib/crossword.play';
