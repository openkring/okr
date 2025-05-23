import { UserModel } from "@bk2/shared/models"
import { Observable } from "rxjs";

/**
 * Utility functions that can be used in debug mode.
 * Debug mode is turned on/off in the user settings.
 */

export function debugFormErrors(formName: string, errors: unknown, currentUser?: UserModel): void {
  if (currentUser?.showDebugInfo) {
    console.log(`errors in form ${formName}:`, errors);
  }
}

export function debugListLoaded<T>(name: string, data$: Observable<T[]>, currentUser?: UserModel): void {
  if (currentUser?.showDebugInfo) {
    data$.subscribe((data) => {
      console.log(`${name}: loaded ${data.length} items.`);
    });
  }
}

export function debugItemLoaded<T>(name: string, data$: Observable<T | undefined>, currentUser?: UserModel): void {
  if (currentUser?.showDebugInfo) {
    data$.subscribe((data) => {
      console.log(`${name} loaded.`, data);
    });
  }
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