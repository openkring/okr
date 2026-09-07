import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';

/** One image as the public gallery endpoint returns it. `path` is the STORAGE path, for imgix. */
export interface PublicGalleryImage {
  path: string;
  title: string;
  description: string;
  altText: string;
  credit: string;
  location: string;
  date: string;
  tags: string[];
}

export interface PublicGallery {
  folder: { slug: string; title: string; description: string };
  images: PublicGalleryImage[];
}

export interface PublicGalleryIndexEntry {
  slug: string;
  title: string;
  description: string;
  count: number;
}

/**
 * Reads published galleries through the `publicApi` Cloud Function instead of Firestore.
 *
 * This is not an optimisation, it is the only possible path: `folders` and `docs` are
 * `allow read: if tenantRead()` in firestore.rules, so an anonymous visitor cannot read them at
 * all. The function runs on the Admin SDK and applies the publication gate itself — a folder is
 * served only when its key ends in `-public` AND it carries the `public` tag.
 *
 * Consequently this service is the ONLY data source a public screen may use for album content.
 * Reaching for FolderService/DocumentService on such a screen produces a permission error for
 * every visitor who is not signed in, which is easy to miss when developing while logged in.
 */
@Injectable({ providedIn: 'root' })
export class PublicGalleryService {
  private readonly http = inject(HttpClient);
  private readonly env = inject(ENV);

  /**
   * Derived from the project id rather than configured: the function's region is fixed for this
   * project (see the `publicApi` rewrites in firebase.json), so an env var would mean editing
   * set-env.js and every tenant's .env for a value that is already fully determined.
   */
  private readonly baseUrl =
    `https://europe-west6-${this.env.firebase.projectId}.cloudfunctions.net/publicApi/public/api/v1`;

  /** The images of one published gallery. 404s when the folder is not published. */
  public getGallery(tenantId: string, folderSlug: string): Observable<PublicGallery> {
    const url = `${this.baseUrl}/gallery?tenantId=${encodeURIComponent(tenantId)}`
      + `&folder=${encodeURIComponent(folderSlug)}`;
    return this.http.get<PublicGallery>(url);
  }

  /** Every published gallery of the tenant, with its image count. */
  public getGalleryIndex(tenantId: string): Observable<{ folders: PublicGalleryIndexEntry[] }> {
    return this.http.get<{ folders: PublicGalleryIndexEntry[] }>(
      `${this.baseUrl}/gallery?tenantId=${encodeURIComponent(tenantId)}`);
  }
}
