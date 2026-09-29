# Wordle Domain

## Overview

Wordle is a self-contained, client-side word game with no Firestore persistence: guess a hidden
German word in a limited number of tries. After every guess each letter is coloured — green
(right letter, right place), yellow (in the word, elsewhere), grey (not in the word).

The player chooses in the page itself:

- **Mode** — `daily` (one word per day and length, the same for everybody, so results can be
  shared) or `endless` (a fresh random word each round).
- **Word length** — 4 to 7 letters, default 5.
- **Tries** — 3 to 10, default 6.

The domain is split into two libs:

- `@okr/games-wordle-util` — pure logic, no Angular runtime: word catalogue, scoring, daily
  word, statistics, `localStorage` parsers, i18n keys. Fully unit-tested.
- `@okr/games-wordle-feature` — `WordlePage` + `WordleStore` and the five translation bundles.

## No Firestore Collection

Everything is kept in `localStorage`; there is no service, no collection and no `*Collection`
constant in `@okr/shared-models`.

| Key | Content |
|---|---|
| `wordle.config` | `WordleConfig` — mode, length, tries |
| `wordle.game.daily.<length>` | today's daily round of that length (resumed after a reload) |
| `wordle.game.endless` | the current endless round |
| `wordle.stats.<mode>.<length>` | `WordleStats` of that bucket |

Every read goes through a parser in `wordle.storage.ts` (`parseConfig`, `parseGame`,
`parseStats`); an entry that does not parse is treated as absent, so a broken or hand-edited
value can never lock the page.

## Umlauts and ß

The board plays with A–Z only. `normalizeLetters` transcribes Ä→AE, Ö→OE, Ü→UE and ß→SS — for
the catalogue and for the keyboard alike, so «KÄSE» is the five-letter word `KAESE`, and a
player typing Ä on a Swiss keyboard fills two cells. A transcription that does not fit the
remaining cells is dropped as a whole (`typeInto`), never half-entered.

## Word catalogue (`wordle.words.ts`)

One hand-picked pool of common German words in natural spelling (MIT, like the rest of the
core — no third-party dictionary). The lists per length are **derived**: transcribe, then group
by transcribed length. Words outside 4–7 letters are simply never used. About 150–270 words per
length; `wordle.words.spec.ts` guards duplicates, spelling (A–Z after transcription) and the
minimum of 150 per length.

**Guesses are not checked against the catalogue.** It supplies solutions only; any complete row
is a valid guess. This is a deliberate choice: a strict check would need a large dictionary, and
the free German ones are GPL-licensed, which does not fit the MIT core.

**Append only.** The daily word depends on the list order (see below), so inserting, removing
or reordering a word changes the daily word of every day from that release on. Add new words at
the end of the pool.

## Scoring (`scoreGuess`)

Two passes, as in the original: exact hits first, each consuming its letter of the solution;
then, left to right, a letter is yellow only while unused copies remain. A letter is never
marked more often than the solution holds it (solution `KANNE`, guess `NNNXX` → yellow, grey,
green, grey, grey).

`keyboardStates` colours the on-screen keyboard with each letter's best result so far.

## Daily word (`wordle.daily.ts`)

- `dayNumber(storeDate)` counts calendar days since 1970-01-01, read as a UTC date — independent
  of the device's time zone and DST. The store passes `getTodayStr()`, the local calendar date,
  so the word changes at local midnight.
- Each length's list is shuffled **once** with a fixed seed (mulberry32 + Fisher–Yates); day `n`
  takes entry `n mod size`. No word repeats before the whole list has been played through.
- The page calls `refreshDay()` when it becomes visible again (`ionViewWillEnter`,
  `visibilitychange`), so a page left open overnight moves on to the new daily word.

## Rounds and settings

- A round's `maxTries` is frozen when it is dealt. Changing the tries setting re-deals only a
  round nobody has guessed in yet; otherwise the notice «applies from the next word» appears.
- A fresh daily round is not saved until its first guess, so the settings still apply to it.
- Changing the length shows that length's daily round (daily) or deals a new word (endless).
- Changing the mode switches to the other mode's round; an unfinished endless round is kept.

## Statistics (`wordle.stats.ts`)

Per (mode, length): played, won, win rate, streak, best streak and the distribution of winning
guess counts. `recordResult` is called exactly once, when a submission ends the round. An endless
streak counts consecutive wins; a daily streak also needs consecutive calendar days, and
`currentStreak` reports it as broken as soon as a day was skipped.

## Sharing

`shareText` builds a spoiler-free result — headline, score (`4/6`, or `X/6` when lost) and one
row of 🟩🟨⬜ per guess. The page copies it with `copyToClipboard` straight from the click
handler, with no `await` before it, so Safari keeps the user gesture.

## WordlePage

Routed at `/wordle` behind `isAuthenticatedGuard`, in the `wordle` feature block
(`dependsOn: ['games']`, `defaultAvailability: 'ga'`) with one row under the shared «Spiele»
menu parent.

- Input from the on-screen QWERTZ keyboard and from a physical keyboard (`document:keydown`).
  The physical keyboard is ignored while Ionic keeps the page behind another one, while a
  modifier is held, and while focus sits in a text field or an open overlay (the select
  popovers). A focused control such as the length select still passes letters to the board but
  keeps Enter, which is how it opens.
- A refused submission (too short) shakes the current row. Submitted rows flip in, one cell
  after the other. Both animations are switched off under `prefers-reduced-motion`.

## i18n

Keys live in `@okr/games-wordle-util` (`wordle-i18n.ts`, `PFX = '@games/wordle/feature.'`),
bundles in `libs/games/wordle/feature/src/i18n/{de,en,fr,es,it}.json`. Parameterised strings
(`too_short`, `won_detail`, `lost_detail`, `share_daily`) use single braces filled with `fill()`
from `@okr/shared-util-core`.
