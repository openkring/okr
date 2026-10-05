import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import { PLATFORM_ID, computed, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { ActivityService } from '@okr/activity-data-access';
import { AppStore } from '@okr/shared-feature';

import { AnswerStatus, initialState } from './quiz.state';

export const QuizStore = signalStore(
  withState(initialState),
  withProps(() => ({
    _browser: isPlatformBrowser(inject(PLATFORM_ID)),
    _appStore: inject(AppStore),
    _activityService: inject(ActivityService),
  })),
  withMethods((store) => {
    function logGame(action: 'start' | 'finish'): void {
      store._activityService.logGame('quiz', action, store._appStore.currentUser);
    }

    const unanswered = (): number =>
      store.questions().filter((question) => question.status === 'unanswered').length;

    return {
      answer(questionId: number, choiceId: number) {
        const question = store
          .questions()
          .find((question) => question.id === questionId);

        if (!question) {
          return;
        }
        const wasOpen = unanswered() > 0;

        patchState(store, (quiz) => ({
          questions: quiz.questions.map((question) => {
            if (question.id === questionId) {
              const status: AnswerStatus =
                question.answer === choiceId ? 'correct' : 'incorrect';
              return {
                ...question,
                status,
              };
            } else {
              return question;
            }
          }),
        }));

        // An answer never goes back to 'unanswered', so the last open question being answered
        // happens exactly once per quiz.
        if (wasOpen && unanswered() === 0) {
          logGame('finish');
        }
      },
    };
  }),

  withComputed((state) => {
    return {
      status: computed(() => {
        const status: Record<AnswerStatus, number> = {
          unanswered: 0,
          correct: 0,
          incorrect: 0,
        };

        for (const question of state.questions()) {
          status[question.status]++;
        }

        return status;
      }),
    };
  }),

  withHooks({
    // The quiz is in-memory only, so opening the page always starts a new one.
    onInit(store) {
      if (store._browser) {
        store._activityService.logGame('quiz', 'start', store._appStore.currentUser);
      }
    },
  })
);
