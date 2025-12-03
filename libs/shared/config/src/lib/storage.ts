import { Inject, InjectionToken } from "@angular/core";
import { BkEnvironment, ENV } from "./env";
import { connectStorageEmulator, FirebaseStorage, getStorage, ref, uploadBytesResumable, UploadTask } from "firebase/storage";
import { getApp } from "firebase/app";

export const STORAGE_EMULATOR_PORT = 9199;

export const STORAGE = new InjectionToken('Firebase storage', {
  providedIn: 'root',
  factory: () => {
      return getBkStorage();
  } 
});

export function uploadToFirebaseStorage(path: string, file: File): UploadTask {
  const _storage = getBkStorage();
  const _ref = ref(_storage, path);
  return uploadBytesResumable(_ref, file);
}

// all apps are using the same storage bucket from bkaiser-org.appspot.com
// you need to grant access to the bucket for the app you are using with gsutil tool
// gsutil -m acl ch -r -u service-<project number>@gcp-sa-firebasestorage.iam.gserviceaccount.com gs://bkaiser-org.appspot.com
// see: https://firebase.google.com/docs/storage/web/start?_gl=1*1mibu5l*_up*MQ..*_ga*OTYxNzQxOTMxLjE3MjU1MjMzNTQ.*_ga_CW55HF8NVT*MTcyNTUyMzM1NC4xLjAuMTcyNTUyMzM1NC4wLjAuMA..
export function getBkStorage(): FirebaseStorage {
  try {
    const _firebaseApp = getApp();
    const _storage = getStorage(_firebaseApp, 'gs://bkaiser-org.appspot.com');
  
    const _env = Inject(ENV) as BkEnvironment;
    if (_env.useEmulators) {
      connectStorageEmulator(_storage, 'localhost', STORAGE_EMULATOR_PORT);
    }
    return _storage;  
  }
  catch(ex) {
    console.error(`shared/util/storage.getBkStorage(): ERROR: ${JSON.stringify(ex)}`);
    throw new Error('shared/util/storage.getBkStorage(): ERROR: ' + JSON.stringify(ex));
  }
}

/**
 * see explanation of multi-bucket setup here:
 * https://stackoverflow.com/questions/68340724/how-do-i-create-additional-buckets-in-firebase-cloud-storage-emulator/77936073#77936073
 * This URL has more details on the configuration:

https://firebase.google.com/docs/cli/targets#set-up-deploy-target-storage-database

This documentation page also has information on how to handle multiple buckets with the sdk:

https://firebase.google.com/docs/storage/web/start#use_multiple_storage_buckets

*/