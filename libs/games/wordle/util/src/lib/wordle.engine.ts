import { normalizeLetters } from './wordle.letters';
import { LetterState, WordleGame, WordleRejection, WordleStatus } from './wordle.types';

/**
 * Scores one guess against the solution, the way Wordle does — including repeated letters.
 *
 * Two passes: first every exact hit is `correct` and uses up that letter of the solution; then,
 * left to right, a letter is `present` only while unused copies of it remain. With solution
 * `KANNE`, the guess `NNNXX` scores `present, absent, correct, absent, absent`: the third N is
 * an exact hit, the first N takes the one N left over, and the second N finds none. A letter is
 * never marked more often than it occurs in the solution.
 *
 * Both strings must already be normalised and of equal length.
 */
export function scoreGuess(guess: string, solution: string): LetterState[] {
  const states: LetterState[] = Array.from({ length: guess.length }, () => 'absent');
  const remaining = new Map<string, number>();

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === solution[i]) {
      states[i] = 'correct';
    } else {
      remaining.set(solution[i], (remaining.get(solution[i]) ?? 0) + 1);
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (states[i] === 'correct') continue;
    const left = remaining.get(guess[i]) ?? 0;
    if (left > 0) {
      states[i] = 'present';
      remaining.set(guess[i], left - 1);
    }
  }
  return states;
}

/** Won once a guess equals the solution; lost once every try is used up without that. */
export function gameStatus(game: WordleGame): WordleStatus {
  if (game.guesses.includes(game.solution)) return 'won';
  return game.guesses.length >= game.maxTries ? 'lost' : 'playing';
}

const RANK: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };

/**
 * The colour of every letter the player has tried so far, for the on-screen keyboard. A letter
 * keeps its BEST result: once `correct` somewhere it stays green even if a later guess put it in
 * the wrong spot.
 */
export function keyboardStates(game: WordleGame): Record<string, LetterState> {
  const out: Record<string, LetterState> = {};
  for (const guess of game.guesses) {
    scoreGuess(guess, game.solution).forEach((state, i) => {
      const letter = guess[i];
      const known = out[letter];
      if (known === undefined || RANK[state] > RANK[known]) out[letter] = state;
    });
  }
  return out;
}

/**
 * Appends typed text to the row being entered, transcribing umlauts and ß on the way. Letters
 * that do not fit the word length are dropped — «Ä» into a row with one free cell adds nothing,
 * rather than half a transcription.
 */
export function typeInto(current: string, typed: string, length: number): string {
  const letters = normalizeLetters(typed);
  return current.length + letters.length <= length ? current + letters : current;
}

export type SubmitResult =
  | { ok: true; game: WordleGame }
  | { ok: false; reason: WordleRejection };

/**
 * Submits the typed row. There is deliberately NO dictionary check: the catalogue only provides
 * solutions, and any complete row is a valid guess (see `wordle.words.ts`).
 */
export function submitGuess(game: WordleGame, row: string): SubmitResult {
  if (gameStatus(game) !== 'playing') return { ok: false, reason: 'finished' };
  const guess = normalizeLetters(row);
  if (guess.length !== game.length) return { ok: false, reason: 'too-short' };
  return { ok: true, game: { ...game, guesses: [...game.guesses, guess] } };
}

const EMOJI: Record<LetterState, string> = { correct: '🟩', present: '🟨', absent: '⬜' };

/**
 * The spoiler-free result to share: a headline (e.g. «Wordle 29.09.2026 4/6») followed by one
 * line of coloured squares per guess. A lost round shows `X` instead of the number of guesses.
 */
export function shareText(game: WordleGame, headline: string): string {
  const status = gameStatus(game);
  const score = status === 'won' ? String(game.guesses.length) : 'X';
  const grid = game.guesses.map(guess => scoreGuess(guess, game.solution).map(s => EMOJI[s]).join(''));
  return [`${headline} ${score}/${game.maxTries}`, '', ...grid].join('\n');
}
