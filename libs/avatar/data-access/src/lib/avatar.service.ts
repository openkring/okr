import { effect, Inject, Injectable, Injector, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, Observable, of, take } from 'rxjs';
import { Platform } from '@ionic/angular/standalone';
import { Photo } from '@capacitor/camera';

import { BkEnvironment, ENV } from '@bk2/shared-config';
import { THUMBNAIL_SIZE } from '@bk2/shared-constants';
import { FirestoreService } from '@bk2/shared-data-access';
import { AvatarCollection, AvatarModel } from '@bk2/shared-models';
import { addImgixParams } from '@bk2/shared-util-core';

import { newAvatarModel, readAsFile } from '@bk2/avatar-util';
import { UploadService } from './upload.service';

export interface UserPhoto {
  filepath: string;
  webviewPath?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AvatarService {
  // Cache for avatar storagePaths to avoid repeated Firestore reads
  // Key format: modelType.documentId (e.g., "person.abc123" or "org.xyz789")
  // Using signal to ensure reactivity and real-time updates from Firestore
  private storagePathCache = signal(new Map<string, string | null>());

  // classic DI to enable mocks for testing
  // eslint-disable-next-line @angular-eslint/prefer-inject
  constructor(
    private readonly platform: Platform,
    private readonly firestoreService: FirestoreService, 
    private readonly uploadService: UploadService,
    @Inject(ENV) private readonly env: BkEnvironment,
    private readonly injector: Injector
  ) {
    // Convert avatar collection Observable to signal for reactive cache updates
    const avatars = toSignal(
      this.firestoreService.searchData<AvatarModel>(
        AvatarCollection,
        [{ key: 'tenants', operator: 'array-contains', value: this.env.tenantId }],
        'none'
      ),
      { initialValue: [], injector: this.injector }
    );

    // Use effect to reactively update cache when avatars change
    effect(() => {
      const avatarList = avatars();      
      const newCache = new Map<string, string | null>();
      for (const avatar of avatarList) {
        newCache.set(avatar.bkey, avatar.storagePath || null);
      }
      
      this.storagePathCache.set(newCache);
    }, { injector: this.injector, allowSignalWrites: true });
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
   * @param key the key of the avatar in the format ModelType.ModelKey e.g. org.1123123asdf
   * @returns an Observable of the avatar model or undefined if not found
   */
  public read(key: string): Observable<AvatarModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.firestoreService.readModel<AvatarModel>(AvatarCollection, key);
  }

  public getRelStorageUrl(key: string): Observable<string> {
    return this.firestoreService.readModel<AvatarModel>(AvatarCollection, key).pipe(
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

    const cache = this.storagePathCache();
    const storagePath = cache.get(key);
    
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
    const cache = this.storagePathCache();
    return cache.get(key) ?? null;
  }
}
