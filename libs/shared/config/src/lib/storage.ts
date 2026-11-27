import { activeFirebaseApp } from './firebase-app';
import { Inject, InjectionToken } from "@angular/core";
import { OkrEnvironment, ENV } from "./env";
import { getAuth } from "firebase/auth";
import { connectStorageEmulator, FirebaseStorage, getStorage, ref, uploadBytesResumable, UploadTask } from "firebase/storage";

export const STORAGE_EMULATOR_PORT = 9199;

export const STORAGE = new InjectionToken('Firebase storage', {
  providedIn: 'root',
  factory: () => {
      return getBkStorage();
  } 
});

export type StorageBucket = 'default' | 'private';
const BUCKET_URLS: Record<StorageBucket, string> = {
  default: 'gs://bkaiser-org.appspot.com',
  // spec 1.82: album videos. Write-only for clients (storage-private.rules); delivery is signed.
  private: 'gs://bkaiser-org-private',
};
export const PRIVATE_BUCKET_URL = BUCKET_URLS.private;

export function uploadToFirebaseStorage(path: string, file: File, bucket: StorageBucket = 'default'): UploadTask {
  const _storage = getBkStorage(bucket);
  const _ref = ref(_storage, path);
  const uploadedBy = currentAuthUid();
  // who uploaded the file (Firebase Auth uid = users/{uid}), shown in the image detail view;
  // the content type is still taken from the file when the metadata does not name one
  return uploadBytesResumable(_ref, file, uploadedBy ? { customMetadata: { [UPLOADED_BY_METADATA_KEY]: uploadedBy } } : undefined);
}

/** Storage custom metadata key holding the Firebase Auth uid of the uploader (set since 2026-11-27). */
export const UPLOADED_BY_METADATA_KEY = 'uploadedBy';

function currentAuthUid(): string | undefined {
  try {
    return getAuth(activeFirebaseApp()).currentUser?.uid;
  } catch {
    return undefined;
  }
}

// all apps are using the same storage bucket from bkaiser-org.appspot.com
// you need to grant access to the bucket for the app you are using with gsutil tool
// gsutil -m acl ch -r -u service-<project number>@gcp-sa-firebasestorage.iam.gserviceaccount.com gs://bkaiser-org.appspot.com
// see: https://firebase.google.com/docs/storage/web/start?_gl=1*1mibu5l*_up*MQ..*_ga*OTYxNzQxOTMxLjE3MjU1MjMzNTQ.*_ga_CW55HF8NVT*MTcyNTUyMzM1NC4xLjAuMTcyNTUyMzM1NC4wLjAuMA..
export function getBkStorage(bucket: StorageBucket = 'default'): FirebaseStorage {
  try {
    const _firebaseApp = activeFirebaseApp();
    const _storage = getStorage(_firebaseApp, BUCKET_URLS[bucket]);
  
    const _env = Inject(ENV) as OkrEnvironment;
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