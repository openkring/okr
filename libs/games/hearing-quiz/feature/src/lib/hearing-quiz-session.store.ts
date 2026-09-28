import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { HearingQuizNodeModel } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { HearingQuizMediaService, HearingQuizNodeService, HearingQuizResultService } from '@okr/games-hearing-quiz-data-access';
import {
  HEARING_QUIZ_I18N_KEYS,
  HearingQuizI18n,
  HearingQuizScore,
  answerOrder,
  isPlayable,
  newHearingQuizResult,
  sessionQuestions,
  topicKeyOf,
} from '@okr/games-hearing-quiz-util';

export type HearingQuizSessionStatus = 'loading' | 'running' | 'done' | 'empty' | 'notFound';

/** What the user did with one question. `chosen: -1` = skipped. */
export interface HearingQuizAnswerRecord {
  chosen: number;
  isCorrect: boolean;
}

export type HearingQuizSessionState = {
  status: HearingQuizSessionStatus;
  /** 'single' = one question opened from the tree; 'session' = a training folder */
  mode: 'single' | 'session';
  folderKey: string;
  /** a "Nochmals üben" rerun: attempts are recorded, but no session total (it would pose as the folder's score) */
  isPractice: boolean;
  questions: HearingQuizNodeModel[];
  /** question keys still to present, in order; a skipped question is re-appended once */
  queue: string[];
  position: number;
  requeued: string[];
  records: Record<string, HearingQuizAnswerRecord>;
  /** display order of the current question's answers (indexes into `answers`) */
  order: number[];
  /** index into `answers` the user chose for the current question, -1 while unanswered */
  chosen: number;
  replays: number;
  usedHint: boolean;
  startedAt: number;
  /** the whole tree, for the topic key of each result */
  allNodes: HearingQuizNodeModel[];
};

const initialState: HearingQuizSessionState = {
  status: 'loading',
  mode: 'single',
  folderKey: '',
  isPractice: false,
  questions: [],
  queue: [],
  position: 0,
  requeued: [],
  records: {},
  order: [],
  chosen: -1,
  replays: 0,
  usedHint: false,
  startedAt: 0,
  allNodes: [],
};

/**
 * One exercise run — a single question or a training session (spec §5, §6). Component-provided
 * on the exercise page.
 *
 * Results are written as they happen (one `attempt` per answered or finally skipped question),
 * never batched at the end: closing the tab mid-session must not lose what was done. The writes
 * are fire-and-forget; offline they sit in Firestore's queue.
 */
export const HearingQuizSessionStore = signalStore(
  withState<HearingQuizSessionState>(initialState),

  withProps(() => ({
    appStore: inject(AppStore),
    env: inject(ENV),
    nodeService: inject(HearingQuizNodeService),
    resultService: inject(HearingQuizResultService),
    mediaService: inject(HearingQuizMediaService),
    i18n: inject(I18nService).translateAll(HEARING_QUIZ_I18N_KEYS) as HearingQuizI18n,
    /** url → blob URL of the prefetched clips of this run */
    media: { map: new Map<string, string>() },
  })),

  withComputed(store => ({
    current: computed((): HearingQuizNodeModel | undefined => {
      const key = store.queue()[store.position()];
      return store.questions().find(q => q.okey === key);
    }),
    isAnswered: computed(() => store.chosen() >= 0),
    total: computed(() => store.questions().length),
    /** questions finished (answered, or skipped for the last time) */
    finishedCount: computed(() => Object.keys(store.records()).length),
    score: computed((): HearingQuizScore => {
      const records = Object.values(store.records());
      return {
        correct: records.filter(r => r.isCorrect).length,
        wrong: records.filter(r => r.chosen >= 0 && !r.isCorrect).length,
        skipped: records.filter(r => r.chosen < 0).length,
      };
    }),
    missed: computed(() => store.questions().filter(q => {
      const r = store.records()[q.okey];
      return r && !r.isCorrect;
    })),
    uid: computed(() => store.appStore.fbUser()?.uid ?? ''),
  })),

  withComputed(store => ({
    isCorrect: computed(() => {
      const q = store.current();
      return !!q && store.chosen() === q.correctAnswer;
    }),
    /** 1-based number of the question on screen, for "4 / 10" */
    displayNumber: computed(() => Math.min(store.finishedCount() + 1, store.total())),
    isLast: computed(() => store.position() >= store.queue().length - 1),
  })),

  withMethods(store => {
    const localUrl = (url: string): string => store.media.map.get(url) ?? url;

    const presentCurrent = (): void => {
      const q = store.current();
      patchState(store, {
        order: q ? answerOrder(q.answers?.length ?? 0) : [],
        chosen: -1,
        replays: 0,
        usedHint: false,
      });
    };

    const saveAttempt = (q: HearingQuizNodeModel, chosen: number, isCorrect: boolean): void => {
      const uid = store.uid();
      if (!uid) return;
      const r = newHearingQuizResult(store.env.tenantId, uid);
      r.kind = 'attempt';
      r.nodeKey = q.okey;
      r.topicKey = topicKeyOf(store.allNodes(), q.okey);
      r.date = getTodayStr(DateFormat.StoreDate);
      r.timestamp = getTodayStr(DateFormat.StoreDateTime);
      r.chosenAnswer = chosen;
      r.isCorrect = isCorrect;
      r.replays = store.replays();
      r.usedHint = store.usedHint();
      void store.resultService.save(r, store.appStore.currentUser());
    };

    const saveSession = (isComplete: boolean): void => {
      const uid = store.uid();
      if (!uid || store.mode() !== 'session' || store.isPractice() || store.finishedCount() === 0) return;
      const score = store.score();
      const r = newHearingQuizResult(store.env.tenantId, uid);
      r.kind = 'session';
      r.nodeKey = store.folderKey();
      r.topicKey = topicKeyOf(store.allNodes(), store.folderKey());
      r.date = getTodayStr(DateFormat.StoreDate);
      r.timestamp = getTodayStr(DateFormat.StoreDateTime);
      r.correct = score.correct;
      r.wrong = score.wrong;
      r.skipped = score.skipped;
      r.durationSec = Math.round((Date.now() - store.startedAt()) / 1000);
      r.isComplete = isComplete;
      void store.resultService.save(r, store.appStore.currentUser());
    };

    const begin = async (questions: HearingQuizNodeModel[]): Promise<void> => {
      if (questions.length === 0) {
        patchState(store, { status: 'empty' });
        return;
      }
      store.mediaService.release(store.media.map);
      // everything is fetched BEFORE the first question (spec §11.6): offline from here on
      store.media.map = await store.mediaService.prefetch(questions.map(q => q.audioUrl));
      patchState(store, {
        questions,
        queue: questions.map(q => q.okey),
        position: 0,
        requeued: [],
        records: {},
        startedAt: Date.now(),
        status: 'running',
      });
      presentCurrent();
    };

    const next = (): void => {
      if (store.position() >= store.queue().length - 1) {
        saveSession(true);
        patchState(store, { status: 'done' });
        return;
      }
      patchState(store, { position: store.position() + 1 });
      presentCurrent();
    };

    return {
      /** Load a single question (`nodeKey`) or a training folder (`folderKey`). */
      async load(nodeKey: string | undefined, folderKey: string | undefined): Promise<void> {
        patchState(store, { ...initialState, status: 'loading' });
        const nodes = await firstValueFrom(store.nodeService.list());
        patchState(store, { allNodes: nodes });
        if (folderKey) {
          const folder = nodes.find(n => n.okey === folderKey && n.type === 'folder');
          if (!folder) { patchState(store, { status: 'notFound' }); return; }
          patchState(store, { mode: 'session', folderKey });
          await begin(sessionQuestions(nodes, folder));
        } else {
          const question = nodes.find(n => n.okey === nodeKey);
          if (!question || !isPlayable(question)) { patchState(store, { status: 'notFound' }); return; }
          patchState(store, { mode: 'single', folderKey: question.parentKey ?? '' });
          await begin([question]);
        }
      },

      audioUrlOf(q: HearingQuizNodeModel | undefined): string {
        return q ? localUrl(q.audioUrl) : '';
      },

      countReplay(): void {
        patchState(store, { replays: store.replays() + 1 });
      },

      markHintUsed(): void {
        patchState(store, { usedHint: true });
      },

      /** One answer per question counts; later taps are ignored (spec §5.4). */
      choose(answerIndex: number): void {
        const q = store.current();
        if (!q || store.isAnswered()) return;
        const isCorrect = answerIndex === q.correctAnswer;
        patchState(store, {
          chosen: answerIndex,
          records: { ...store.records(), [q.okey]: { chosen: answerIndex, isCorrect } },
        });
        saveAttempt(q, answerIndex, isCorrect);
      },

      /** Skip: offered once more at the end; skipping it again finishes it as skipped. */
      skip(): void {
        const q = store.current();
        if (!q || store.isAnswered()) return;
        if (!store.requeued().includes(q.okey) && store.mode() === 'session') {
          patchState(store, { queue: [...store.queue(), q.okey], requeued: [...store.requeued(), q.okey] });
        } else {
          patchState(store, { records: { ...store.records(), [q.okey]: { chosen: -1, isCorrect: false } } });
          saveAttempt(q, -1, false);
        }
        next();
      },

      next,

      /** Leaving early keeps what was answered (spec §6). */
      abort(): void {
        if (store.status() === 'running') saveSession(false);
      },

      /** "Nochmals üben": a new run over the missed questions only. */
      async practiceMissed(): Promise<void> {
        const missed = store.missed();
        patchState(store, { isPractice: true, status: 'loading' });
        await begin(missed);
      },

      destroy(): void {
        store.mediaService.release(store.media.map);
        store.media.map = new Map();
      },
    };
  }),
);
