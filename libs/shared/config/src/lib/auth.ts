import { inject, InjectionToken } from "@angular/core";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { ENV } from "./env";

export const AUTH_EMULATOR_PORT = 9099;

export function authFactory() {
  const auth = getAuth();
  const _env = inject(ENV);

  if (_env.useEmulators) {
    connectAuthEmulator(auth, `http://localhost:${AUTH_EMULATOR_PORT}`, {
      disableWarnings: true,
    });
  }
  return auth;
}

export const AUTH = new InjectionToken('Firebase auth', {
  providedIn: 'root',
  factory: authFactory
});