import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonNote, IonTextarea,
  IonTitle, IonToolbar,
} from '@ionic/angular';

import { JournalWriteRefused } from '@okr/travel-journal-util';
import { JournalStore } from './journal.store';

/**
 * TEMPORARY workbench for travel journal plan 2 (spec 1.113): proves the offline data layer on the
 * iPad. Plain German labels, no i18n, no menu entry — plan 3 replaces it on the same routes with the
 * map overview and the story pages.
 */
@Component({
  selector: 'okr-journal-workbench-page',
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton, IonTextarea],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/journal" /></ion-buttons>
        <ion-title>{{ title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (!store.native()) {
        <p>Das Reisetagebuch ist vorerst nur in der iPad-App verfügbar.</p>
      } @else if (!store.ready()) {
        <p>Lade …</p>
      } @else {
        <ion-note>
          Autor: {{ store.author()?.name || store.author()?.personKey || 'Kein Autor — öffne das Reisetagebuch einmal mit Internet.' }}
        </ion-note>
        @if (message()) { <p class="message">{{ message() }}</p> }
        @if (store.error()) { <p class="message">Fehler: {{ store.error() }}</p> }

        @if (!journalKey()) {
          <ion-list>
            @for (j of store.journals(); track j.key) {
              <ion-item button (click)="open([j.key])"><ion-label>{{ j.title || '(ohne Titel)' }}</ion-label></ion-item>
            } @empty { <ion-item><ion-label>Noch kein Reisetagebuch.</ion-label></ion-item> }
          </ion-list>
          <input #t placeholder="Titel" />
          <ion-button (click)="act(() => store.createJournal(t.value || 'Reisetagebuch')); t.value = ''">Neues Reisetagebuch</ion-button>
        } @else if (!footprintKey()) {
          <ion-list>
            @for (f of footprints(); track f.key) {
              <ion-item button (click)="open([f.journalKey, f.key])">
                <ion-label>
                  <h3>{{ f.title || '(ohne Titel)' }}</h3>
                  <p>{{ f.date }} {{ f.time }} · {{ f.latitude ?? '–' }}, {{ f.longitude ?? '–' }} · {{ f.blocks.length }} Blöcke</p>
                </ion-label>
              </ion-item>
            } @empty { <ion-item><ion-label>Noch kein Footprint.</ion-label></ion-item> }
          </ion-list>
          <input #f placeholder="Ort / Titel" />
          <ion-button (click)="act(() => store.addFootprint(journalKey()!, f.value || 'Footprint')); f.value = ''">Neuer Footprint</ion-button>
        } @else if (footprint(); as fp) {
          <p>{{ fp.date }} {{ fp.time }} · {{ fp.latitude ?? '–' }}, {{ fp.longitude ?? '–' }}</p>
          @for (b of fp.blocks; track b.key) {
            <div class="block">
              <small>{{ b.authorKey === store.author()?.personKey ? 'von dir' : 'von ' + b.authorKey }}</small>
              @if (b.kind === 'text') {
                <div [innerHTML]="b.html"></div>
              } @else {
                <div class="thumbs">
                  @for (key of b.imageKeys; track key) {
                    @if (images().get(key); as img) { <img [src]="fileUrl(img.path400)" alt="" /> }
                  }
                </div>
              }
              @if (b.authorKey === store.author()?.personKey) {
                <ion-button size="small" fill="clear" (click)="act(() => store.archiveBlock(b.key))">Löschen</ion-button>
              }
            </div>
          }
          <ion-textarea #text placeholder="Text" [autoGrow]="true" />
          <ion-button (click)="addText(text.value ?? ''); text.value = ''">Text hinzufügen</ion-button>
          <ion-button (click)="addPhotos(fp.journalKey, fp.key)">Fotos hinzufügen</ion-button>
        }
      }
    </ion-content>
  `,
  styles: [`
    .message { color: var(--ion-color-danger); }
    .block { border-bottom: 1px solid var(--ion-color-light); padding: 8px 0; }
    .thumbs { display: flex; flex-wrap: wrap; gap: 4px; }
    .thumbs img { width: 120px; height: 120px; object-fit: cover; border-radius: 4px; }
    input { padding: 8px; margin-right: 8px; }
  `],
})
export class JournalWorkbenchPage {
  protected readonly store = inject(JournalStore);
  private readonly router = inject(Router);

  public readonly journalKey = input<string | undefined>();
  public readonly footprintKey = input<string | undefined>();

  protected readonly message = signal('');
  private readonly documentsUri = signal('');

  protected readonly footprints = computed(() => (this.journalKey() ? this.store.footprints(this.journalKey()!) : []));
  protected readonly footprint = computed(() => (this.footprintKey() ? this.store.footprint(this.footprintKey()!) : undefined));
  protected readonly images = computed(() => (this.journalKey() ? this.store.images(this.journalKey()!) : new Map()));
  protected readonly title = computed(() => {
    if (this.footprint()) return this.footprint()!.title || 'Footprint';
    const journal = this.store.journals().find((j) => j.key === this.journalKey());
    return journal?.title || 'Reisetagebuch';
  });

  public constructor() {
    void this.store.init();
    if (Capacitor.isNativePlatform()) {
      void Filesystem.getUri({ directory: Directory.Documents, path: '' }).then((r) => this.documentsUri.set(r.uri.replace(/\/$/, '')));
    }
  }

  protected open(path: string[]): void {
    void this.router.navigate(['/journal', ...path]);
  }

  protected fileUrl(relativePath: string): string {
    return this.documentsUri() ? Capacitor.convertFileSrc(`${this.documentsUri()}/${relativePath}`) : '';
  }

  protected addText(value: string): void {
    const text = value.trim();
    if (!text) return;
    const html = text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
    void this.act(() => this.store.addTextBlock(this.footprintKey()!, html));
  }

  protected addPhotos(journalKey: string, footprintKey: string): void {
    void this.act(async () => {
      const { added, skipped } = await this.store.addPhotoBlock(journalKey, footprintKey);
      const skippedText = skipped.length ? `, ${skipped.length} übersprungen (${skipped.map((s) => s.reason).join(', ')})` : '';
      this.message.set(`${added} Foto(s) hinzugefügt${skippedText}`);
    });
  }

  protected async act(action: () => Promise<unknown>): Promise<void> {
    this.message.set('');
    try {
      await action();
    } catch (error) {
      if (error instanceof JournalWriteRefused) {
        this.message.set(error.reason === 'noAuthor'
          ? 'Kein Autor — öffne das Reisetagebuch einmal mit Internet, dann kannst du schreiben.'
          : 'Nur die Autorin oder der Autor kann diesen Block ändern.');
      } else {
        this.message.set(`Fehler: ${String(error)}`);
      }
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

