# Quiz Domain

## Overview

The Quiz domain is a self-contained, client-side interactive quiz feature with no Firestore persistence. It is used as a demonstration of NgRx Signal Store state management with pure in-memory state. The quiz presents a set of multiple-choice questions, tracks per-question answer status, and computes a running score summary.

## No Firestore Collection

Quiz state is entirely in-memory. Questions and the quiz configuration are defined statically in `quiz.state.ts` (`initialState`).

## Data Types

### Question

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique question identifier |
| `question` | string | Question text |
| `answer` | number | ID of the correct choice |
| `choices` | `{ id: number; text: string }[]` | Answer options |
| `explanation` | string | Shown after the user answers |
| `status` | `AnswerStatus` | `'unanswered' \| 'correct' \| 'incorrect'` |

### Quiz (initialState)

| Field | Type | Description |
|---|---|---|
| `title` | string | Quiz title (default: `'NgRx Quiz'`) |
| `questions` | `Question[]` | List of questions |
| `timeInSeconds` | number | Time limit in seconds (default: 180) |

## QuizStore

NgRx Signal Store. Methods:

- `answer(questionId, choiceId)` — Marks the question as `'correct'` or `'incorrect'` by comparing `choiceId` with `question.answer`.

Computed:

- `status` — `Record<AnswerStatus, number>` counting how many questions are in each state (`unanswered`, `correct`, `incorrect`).

## QuizPageComponent (`bk-quiz-page`)

Standalone Ionic page component. Iterates over `quizStore.questions()` and renders each as a card with choice buttons. After answering, shows `'Richtig !'` or `'Falsch !'` and the explanation text.

## Library Path

`@bk2/quiz-feature` (`libs/quiz/feature/src/lib/`)
