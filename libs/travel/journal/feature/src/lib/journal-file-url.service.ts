import { inject, Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

import { JournalSyncService } from '@okr/travel-journal-data-access';

/**
 * Turns the journal's RELATIVE photo paths (`journals/<journalKey>/<id>-400.jpg`, relative to the app's
 * Documents directory — the container path changes on every app update) into URLs the WebView can
 * load. The Documents URI is read once; until then `url()` returns ''. `refresh()` is called when photo
 * files arrived later (P2P or Firebase): the version query makes the WebView load an image again that it
 * had failed to load before. In the browser (plan 8, web view for authors) there are no local files: the URLs are
 * signed links of the published photos, fetched in batches; drafts' photos stay empty.
 */
/** signJournalPhotos links live 15 minutes; renew them a little before. */
const SIGNED_URL_RENEW_MS = 12 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class JournalFileUrlService {
  private readonly documentsUri = signal('');
  private readonly version = signal(0);
  private readonly native = Capacitor.isNativePlatform();
  private readonly syncService = inject(JournalSyncService);
  private readonly signed = signal<Record<string, string>>({}); // relative path → signed URL (web)
  private readonly signedAt = new Map<string, number>(); // relative path → when its URL was fetched
  private readonly requested = new Set<string>();
  private pending = new Map<string, Set<string>>(); // journalKey → file names
  private flushTimer?: ReturnType<typeof setTimeout>;

  public constructor() {
    if (Capacitor.isNativePlatform()) {
      void Filesystem.getUri({ directory: Directory.Documents, path: '' })
        .then((r) => this.documentsUri.set(r.uri.replace(/\/$/, '')))
        .catch(() => undefined);
    }
  }

  /** Reads the Documents URI signal, so a computed that calls this updates once the URI is known. */
  public url(relativePath: string | undefined): string {
    if (!this.native) return this.webUrl(relativePath);
    const base = this.documentsUri();
    const version = this.version();
    if (!base || !relativePath) return '';
    const url = Capacitor.convertFileSrc(`${base}/${relativePath}`);
    return version > 0 ? `${url}?v=${version}` : url;
  }

  /** A folder URL for templates (map tiles): no version query, the template appends the file. */
  public dirUrl(relativeDir: string): string {
    const base = this.documentsUri();
    return base ? Capacitor.convertFileSrc(`${base}/${relativeDir}`) : '';
  }

  private webUrl(relativePath: string | undefined): string {
    if (!relativePath) return '';
    const url = this.signed()[relativePath];
    if (url !== undefined) return url;
    const match = /^journals\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+\.jpg)$/.exec(relativePath);
    if (match && !this.requested.has(relativePath)) {
      this.requested.add(relativePath);
      const files = this.pending.get(match[1]) ?? new Set<string>();
      files.add(match[2]);
      this.pending.set(match[1], files);
      this.flushTimer ??= setTimeout(() => void this.flush(), 50);
    }
    return '';
  }

  /** One signJournalPhotos call per journal for everything requested in the last moment. */
  private async flush(): Promise<void> {
    this.flushTimer = undefined;
    const batch = this.pending;
    this.pending = new Map();
    for (const [journalKey, files] of batch) {
      try {
        const urls = await this.syncService.signPhotos(journalKey, [...files]);
        const next = { ...this.signed() };
        const now = Date.now();
        for (const file of files) {
          const path = `journals/${journalKey}/${file}`;
          next[path] = urls[file] ?? ''; // '' = not uploaded (yet)
          this.signedAt.set(path, now);
        }
        this.signed.set(next);
      } catch {
        for (const file of files) this.requested.delete(`journals/${journalKey}/${file}`); // retry on the next render
      }
    }
  }

  /**
   * Web view: forget the links that may have changed — photos that were not in the bucket yet (the iPad uploads the
   * records first, the photos after them) and links close to their 15-minute expiry. The pages ask again on their
   * next render. Called on every live change and once a minute while the web view is open.
   */
  public refreshWeb(): void {
    if (this.native) return;
    const now = Date.now();
    const current = this.signed();
    const stale = Object.keys(current).filter((path) => current[path] === '' || now - (this.signedAt.get(path) ?? 0) > SIGNED_URL_RENEW_MS);
    if (stale.length === 0) return;
    const next = { ...current };
    for (const path of stale) {
      if (next[path].startsWith('blob:')) URL.revokeObjectURL(next[path]); // a seeded local copy (seed)
      delete next[path];
      this.signedAt.delete(path);
      this.requested.delete(path);
    }
    this.signed.set(next);
  }

  /**
   * Browser editing (phase 3 §3): a photo this browser just uploaded is shown from its local object URL right away,
   * without asking signJournalPhotos. Counts as freshly signed, so `refreshWeb` replaces it with a real link only
   * after the renew window.
   */
  public seed(path: string, url: string): void {
    this.requested.add(path);
    this.signedAt.set(path, Date.now());
    this.signed.set({ ...this.signed(), [path]: url });
  }

  /** True only when the file was asked for and is not in the bucket (signed value ''); false while unknown. */
  public isMissing(path: string | undefined): boolean {
    return path !== undefined && this.signed()[path] === '';
  }

  public refresh(): void {
    this.version.update((v) => v + 1);
  }
}
