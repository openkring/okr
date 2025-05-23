import { Inject, InjectionToken } from "@angular/core";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { BkEnvironment, ENV } from "./env";

export const FIRESTORE_EMULATOR_PORT = 8080;

export const FIRESTORE = new InjectionToken('Firebase firestore', {
  providedIn: 'root',
  factory: () => {
    const firestore = getFirestore();
    const _env = Inject(ENV) as BkEnvironment;
    if (_env.useEmulators) {
      connectFirestoreEmulator(firestore, 'localhost', FIRESTORE_EMULATOR_PORT);
    } 
    return firestore;
  }
});

