import { computed } from '@angular/core';
import { patchState, signalStoreFeature, withComputed, withMethods, withState } from '@ngrx/signals';

/**
 * Reusable signal store feature that adds user-facing error state to a store.
 *
 * It exposes:
 * - `error`: the raw, already-translated error message (state, undefined when there is none)
 * - `isError`: computed boolean, true while an error is set
 * - `errorMessage`: computed alias of `error` (the last user-facing message)
 * - `setError(message)`: sets the error message
 * - `clearError()`: clears the error
 *
 * Mutations that can fail (Firestore writes, stream errors) call `setError()` with an
 * already-translated message; UI surfaces it via `<bk-error-banner>`.
 */
export type ErrorState = {
  error: string | undefined;
};

export const initialErrorState: ErrorState = {
  error: undefined
};

export function withErrorState() {
  return signalStoreFeature(
    withState(initialErrorState),
    withComputed((state) => ({
      isError: computed(() => state.error() !== undefined),
      errorMessage: computed(() => state.error())
    })),
    withMethods((store) => ({
      setError(message: string): void {
        patchState(store, { error: message });
      },
      clearError(): void {
        patchState(store, { error: undefined });
      }
    }))
  );
}
