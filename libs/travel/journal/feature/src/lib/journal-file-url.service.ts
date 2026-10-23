import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

/**
 * Turns the journal's RELATIVE photo paths (`journals/<journalKey>/<id>-400.jpg`, relative to the app's
 * Documents directory — the container path changes on every app update) into URLs the WebView can
 * load. The Documents URI is read once; until then `url()` returns ''.
 */
@Injectable({ providedIn: 'root' })
export class JournalFileUrlService {
  private readonly documentsUri = signal('');

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
    return base && relativePath ? Capacitor.convertFileSrc(`${base}/${relativePath}`) : '';
  }
}
