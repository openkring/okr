import { computed, effect, Inject, Injectable, Injector, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, Observable, of, switchMap, take } from 'rxjs';
import { Platform } from '@ionic/angular/standalone';
import { Photo } from '@capacitor/camera';

import { OkrEnvironment, ENV } from '@okr/shared-config';
import { THUMBNAIL_SIZE } from '@okr/shared-constants';
import { APP_STORE_MIN, AppStoreMin, FirestoreService } from '@okr/shared-data-access';
import { AvatarCollection, AvatarModel } from '@okr/shared-models';
import { addImgixParams } from '@okr/shared-util-core';

import { avatarDocId, newAvatarModel, readAsFile } from '@okr/avatar-util';
import { UploadService } from './upload.service';

export interface UserPhoto {
  filepath: string;
  webviewPath?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AvatarService {
  // Cache for avatar storagePaths to avoid repeated Firestore reads.
  // Key format: the avatar doc id — either tenant-scoped ("p13.person.abc123", this
  // tenant's own picture) or bare ("person.abc123", the shared default). Lookups go
  // through resolveStoragePath(), which prefers the tenant-scoped entry.
  // Using signal to ensure reactivity and real-time updates from Firestore
  private storagePathCache = signal(new Map<string, string | null>());

  // classic DI to enable mocks for testing
  // eslint-disable-next-line @angular-eslint/prefer-inject
  constructor(
    private readonly platform: Platform,
    private readonly firestoreService: FirestoreService, 
    private readonly uploadService: UploadService,
    @Inject(ENV) private readonly env: OkrEnvironment,
    @Inject(APP_STORE_MIN) private readonly appStore: AppStoreMin,
    private readonly injector: Injector
  ) {
    // Convert avatar collection Observable to signal for reactive cache updates.
    // Gate the subscription on an authenticated user: the `avatars` collection is
    // protected (rule `allow read: if tenantRead()` → requires a signed-in user), so
    // querying it while logged out yields a permission-denied Listen error. Only open
    // the Firestore Listen once a user doc is present; re-runs on login/logout.
    const avatars = toSignal(
      toObservable(computed(() => !!this.appStore.currentUser()), { injector: this.injector }).pipe(
        switchMap((isAuthenticated) => isAuthenticated
          ? this.firestoreService.searchData<AvatarModel>(
              AvatarCollection,
              // 'system' avatars are the shared defaults (a picture every tenant may show);
              // they arrive in the same stream as this tenant's own avatars.
              [{ key: 'tenants', operator: 'array-contains-any', value: [this.env.tenantId, 'system'] }],
              'none'
            )
          : of([] as AvatarModel[])
        )
      ),
      { initialValue: [], injector: this.injector }
    );

    // Use effect to reactively update cache when avatars change
    effect(() => {
      const avatarList = avatars();      
      const newCache = new Map<string, string | null>();
      for (const avatar of avatarList) {
        newCache.set(avatar.okey, avatar.storagePath || null);
        // Lowercased alias, so a caller holding only a lowercased subject key can look the
        // avatar up (Matrix localparts are the person okey lowercased — see MatrixChatService
        // .personAvatarUrl). The exact-case entry always wins.
        const lower = avatar.okey.toLowerCase();
        if (!newCache.has(lower)) newCache.set(lower, avatar.storagePath || null);
      }
      
      this.storagePathCache.set(newCache);
    });
  }

  /**
   * Save a model as a new Firestore document into the database.
   * We use a combination of the modelType and mkey as the document ID.
   * @param model the avatar data to save
   * @returns a Promise of the key of the newly stored model or undefined if the operation failed
   */
  public async updateOrCreate(avatar: AvatarModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<AvatarModel>(AvatarCollection, avatar, true);
  }

  /**
   * Read an avatar model from Firestore by its key.
   * Reads this tenant's own avatar and falls back to the shared default (see avatarDocId).
   * @param key the key of the avatar in the format ModelType.ModelKey e.g. org.1123123asdf
   * @returns an Observable of the avatar model or undefined if not found
   */
  public read(key: string): Observable<AvatarModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.firestoreService.readModel<AvatarModel>(AvatarCollection, avatarDocId(this.env.tenantId, key)).pipe(
      switchMap(avatar => avatar ? of(avatar) : this.firestoreService.readModel<AvatarModel>(AvatarCollection, key))
    );
  }

  public getRelStorageUrl(key: string): Observable<string> {
    return this.read(key).pipe(
      take(1), // Complete after first emission to prevent memory leaks
      map(avatar => {
        return avatar?.storagePath ?? '';
      })
    );
  }

  public async saveAvatarPhoto(photo: Photo, key: string, tenantId: string, modelName: string): Promise<string | undefined> {
    const file = await readAsFile(photo, this.platform);
    const avatar = newAvatarModel([tenantId], modelName, key, file.name);
    const downloadUrl = await this.uploadService.uploadFile(file, avatar.storagePath, '@document.operation.upload.avatar.title')

    if (downloadUrl) {
      await this.updateOrCreate(avatar);
      // Cache automatically updates via searchData subscription
    }
    return downloadUrl;
  }

  /**
   * Get the avatar URL synchronously using cached storagePath.
   * If the storagePath is not cached, returns the default icon URL.
   * Use getStoragePath() first to ensure the cache is populated.
   * 
   * @param key the key of the avatar in the format ModelType.ModelKey e.g. person.1123123asdf
   * @param defaultIcon the default icon to use if there is no avatar
   * @param size the optional size of the image to retrieve; default is THUMBNAIL_SIZE
   * @returns the imgix URL for the avatar or the default icon if no avatar is found
   */
  public getAvatarUrl(key: string, defaultIcon: string, size = THUMBNAIL_SIZE): string {
    const imgixBaseUrl = this.env.services.imgixBaseUrl;
    
    if (!key || key.length === 0) {
      return `${imgixBaseUrl}/logo/icons/${defaultIcon}.svg`;
    }

    const storagePath = this.resolveStoragePath(key);

    // If not in cache or null, return default icon
    if (!storagePath) {
      return `${imgixBaseUrl}/logo/icons/${defaultIcon}.svg`;
    }
    
    // Construct the URL with imgix parameters
    return `${imgixBaseUrl}/${addImgixParams(storagePath, size)}`;
  }

  /**
   * Get the cached storagePath synchronously without constructing a URL.
   * Returns null if not in cache or if the avatar doesn't exist.
   * 
   * @param key the key of the avatar in the format ModelType.ModelKey e.g. person.1123123asdf
   * @returns the storagePath or null if not found or not cached
   */
  public getCachedStoragePath(key: string): string | null {
    if (!key || key.length === 0) return null;
    return this.resolveStoragePath(key);
  }

  /**
   * Resolves a subject key to a cached storagePath: this tenant's own avatar wins,
   * the shared default (bare doc id, tenants: ['system']) is the fallback.
   * @param key the key of the avatar in the format ModelType.ModelKey e.g. person.1123123asdf
   * @returns the storagePath or null when neither is cached
   */
  private resolveStoragePath(key: string): string | null {
    const cache = this.storagePathCache();
    return cache.get(avatarDocId(this.env.tenantId, key)) ?? cache.get(key) ?? null;
  }
}
