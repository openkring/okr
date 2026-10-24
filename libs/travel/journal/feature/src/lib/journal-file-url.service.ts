import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

/**
 * Turns the journal's RELATIVE photo paths (`journals/<journalKey>/<id>-400.jpg`, relative to the app's
 * Documents directory — the container path changes on every app update) into URLs the WebView can
 * load. The Documents URI is read once; until then `url()` returns ''. `refresh()` is called when photo
 * files arrived later (P2P or Firebase): the version query makes the WebView load an image again that it
 * had failed to load before.
 */
@Injectable({ providedIn: 'root' })
export class JournalFileUrlService {
  private readonly documentsUri = signal('');
  private readonly version = signal(0);

  public constructor() {
    if (Capacitor.isNativePlatform()) {
      void Filesystem.getUri({ directory: Directory.Documents, path: '' })
        .then((r) => this.documentsUri.set(r.uri.replace(/\/$/, '')))
        .catch(() => undefined);
    }
  }

  /** Reads the Documents URI signal, so a computed that calls this updates once the URI is known. */
  public url(relativePath: string | undefined): string {
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

  public refresh(): void {
    this.version.update((v) => v + 1);
  }
}
