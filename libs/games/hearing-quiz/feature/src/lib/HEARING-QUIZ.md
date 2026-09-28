# Hearing Quiz Domain (Hörtraining)

## Overview

Listening training for hearing-impaired people: the user plays a recorded clip, picks what they
heard from two to six large answer cards, and gets calm, visual feedback. Content admins author
the material in the app as a tree of topics, trainings and questions.

Spec: `planning/specs/2026-09-28-hearing-quiz-spec.md` (TOC 1.64). Feature block
`hearing-quiz` (`beta`, rolled out to `okr` via `feature-rollout/hearing-quiz`).

## Firestore Collections

| Collection | Model | Who reads | Who writes |
| --- | --- | --- | --- |
| `hearingQuizNodes` | `HearingQuizNodeModel` | every member of the tenant | content admins |
| `hearingQuizResults` | `HearingQuizResultModel` | the owner only (`userKey == uid`) | the owner only |

Results are **health data** (revDSG Art. 5 lit. c). There is no admin view, no tenant-wide
statistic and no activity-log entry for them. `HearingQuizResultService.listMine` filters by uid
AND tenant because the read rule has to be provable from the query (composite index
`userKey` + `tenants`).

## Field Semantics — `HearingQuizNodeModel`

| Field | Meaning |
| --- | --- |
| `type` | `folder` (topic, training) or `question` (leaf) |
| `parentKey` | parent folder okey; `''` = top level; orphans render at the top level |
| `order` | sort order among siblings, renumbered in steps of 1000 on every move |
| `keepOrder` | folder: a session keeps the authoring order instead of shuffling |
| `question` | the prompt above the play button |
| `audioUrl` / `audioPath` | the clip in Storage (`tenant/<t>/hearing-quiz/<nodeKey>/…`) |
| `answers[]` | 2–6 `{ text, caption, imageUrl }`; `imageUrl` is phase 2 |
| `correctAnswer` | index into `answers` |
| `hint` / `hintImageUrl` | optional text and static image shown in the hint sheet |

A copy shares the original's files: archiving never deletes a file, so a shared clip cannot be
pulled from under a copy.

## Libraries

| Lib | Contents |
| --- | --- |
| `@okr/games-hearing-quiz-util` | i18n keys, Vest suite, tree helpers (`flattenTree`, `planMove`, `planDrop`, `cloneSubtree`, `canMoveTo`), session helpers, file limits — unit-tested |
| `@okr/games-hearing-quiz-data-access` | `HearingQuizNodeService`, `HearingQuizResultService`, `HearingQuizMediaService` (upload, session prefetch into blob URLs) |
| `@okr/games-hearing-quiz-ui` | node form, audio recorder/upload field, play button, answer card |
| `@okr/games-hearing-quiz-feature` | tree page + `HearingQuizStore`, exercise page + `HearingQuizSessionStore`, edit modal, `HearingQuizPlayer` |

## Routes

| Route | Component |
| --- | --- |
| `/hearing-quiz/all/c-hearing-quiz` | `HearingQuizTreePage` (context menu `c-hearing-quiz`) |
| `/hearing-quiz/q/:nodeKey` | `HearingQuizExercisePage`, one question |
| `/hearing-quiz/session/:folderKey` | `HearingQuizExercisePage`, a training session |

## Behaviour worth knowing

- **Edit mode** is toggled from the context menu (`toggleEditMode`, content admins only). A tap
  then edits, the chevron still opens a folder, each row's `…` offers move/copy to a chosen
  folder, and rows can be dragged by their handle (Shift = copy). The tree is one flat CDK drop
  list; `planDrop` decides the new parent from the row above the drop point. Dropping into a
  closed folder is done with "Verschieben nach …".
- **Sessions** take the folder's direct, playable questions (clip + ≥ 2 answers), shuffled unless
  `keepOrder`, at most 20. All clips are fetched into blob URLs before the first question, so a
  lost connection mid-session does not break playback.
- **Playback** runs through a Web Audio compressor + make-up gain (loudness evening, no server
  processing). The play button's rings follow the audio element's own `playing` events.
- **Answers** unlock once the clip has played. One answer per question counts. A skipped
  question comes back once at the end of a session; skipped again, it is recorded as skipped.
- **Results** are written per answer, fire-and-forget. A session total is written on completion
  or on leaving early (`isComplete: false`); a "Nochmals üben" rerun records attempts only.
