import { UserModel } from "@bk2/shared-models";
import { Observable, tap } from "rxjs";

/**
 * Utility functions that can be used in debug mode.
 * Debug mode is turned on/off in the user settings.
 */

export function debugFormErrors(formName: string, errors: unknown, currentUser?: UserModel): void {
  if (currentUser?.showDebugInfo) {
    console.log(`errors in form ${formName}:`, errors);
  }
}

/**
 * Returns an RxJS operator that logs list data when debugging is enabled.
 * Use in a pipe: data$.pipe(debugListLoaded('myList', currentUser))
 */
export function debugListLoaded<T>(name: string, currentUser?: UserModel) {
  return tap<T[]>((data) => {
    if (currentUser?.showDebugInfo) {
      console.log(`${name}: loaded ${data.length} items.`);
    }
  });
}

/**
 * Returns an RxJS operator that logs item data when debugging is enabled.
 * Use in a pipe: data$.pipe(debugItemLoaded('myItem', currentUser))
 */
export function debugItemLoaded<T>(name: string, currentUser?: UserModel) {
  return tap<T | undefined>((data) => {
    if (currentUser?.showDebugInfo) {
      console.log(`${name} loaded.`, data);
    }
  });
}

export function debugMessage(message: string, currentUser?: UserModel): void {
  if (currentUser?.showDebugInfo) {
    console.log(message);
  }
}

export function debugFormModel<T>(formName: string, model: T, currentUser?: UserModel): void {
  if (currentUser?.showDebugInfo) {
    console.log(`form ${formName}:`, model);
  }
}

export function debugData<T>(message: string, data: T, currentUser?: UserModel): void {
  if (currentUser?.showDebugInfo) {
    console.log(message, data);
  }
}