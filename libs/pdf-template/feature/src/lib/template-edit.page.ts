// libs/pdf-template/feature/src/lib/template-edit.page.ts
import {
  ChangeDetectionStrategy, Component, computed, effect, inject,
  linkedSignal, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { of } from 'rxjs';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonSegment, IonSegmentButton, IonLabel, IonItem,
  IonInput, IonSelect, IonSelectOption, IonTextarea, IonSpinner,
  IonBackButton,
} from '@ionic/angular/standalone';

import { TemplateModel, TemplateVersionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { safeStructuredClone } from '@bk2/shared-util-core';
import { newTemplateVersion } from '@bk2/pdf-template-util';
import { TemplateService } from '@bk2/pdf-template-data-access';

import { TemplateStore } from './template.store';

type EditorTab = 'metadata' | 'html' | 'css' | 'preview';

@Component({
  selector: 'bk-template-edit-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TemplateStore],
  imports: [
    FormsModule, SvgIconPipe,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    IonContent, IonSegment, IonSegmentButton, IonLabel, IonItem,
    IonInput, IonSelect, IonSelectOption, IonTextarea, IonSpinner,
    IonBackButton,
  ],
  styles: [`
    .editor-area { width: 100%; font-family: monospace; font-size: 0.9rem; min-height: 400px; }
    .preview-frame { width: 100%; height: calc(100vh - 200px); border: none; }
    .preview-placeholder { display: flex; align-items: center; justify-content: center; height: 300px; }
    ion-segment { margin: 8px; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/templates" />
        </ion-buttons>
        <ion-title>{{ template()?.name || 'Vorlage' }} · v{{ draftVersion().version }} (Entwurf)</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="outline" (click)="saveDraft()" [disabled]="saving()">Speichern</ion-button>
          <ion-button fill="solid" color="primary" (click)="publish()" [disabled]="saving()">
            Veröffentlichen
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <ion-segment [ngModel]="activeTab()" (ngModelChange)="activeTab.set($any($event))">
        <ion-segment-button value="metadata"><ion-label>Metadaten</ion-label></ion-segment-button>
        <ion-segment-button value="html"><ion-label>HTML</ion-label></ion-segment-button>
        <ion-segment-button value="css"><ion-label>CSS</ion-label></ion-segment-button>
        <ion-segment-button value="preview"><ion-label>Vorschau</ion-label></ion-segment-button>
      </ion-segment>
    </ion-header>

    <ion-content class="ion-padding">
      @if(activeTab() === 'metadata') {
        @if(template(); as tmpl) {
          <ion-item>
            <ion-label position="stacked">Name</ion-label>
            <ion-input [ngModel]="tmpl.name" (ngModelChange)="onTemplateFieldChange('name', $event)" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Beschreibung</ion-label>
            <ion-input [ngModel]="tmpl.description" (ngModelChange)="onTemplateFieldChange('description', $event)" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Kategorie</ion-label>
            <ion-select [ngModel]="tmpl.category" (ngModelChange)="onTemplateFieldChange('category', $event)">
              <ion-select-option value="invoice">Rechnung</ion-select-option>
              <ion-select-option value="expense">Spesen</ion-select-option>
              <ion-select-option value="report">Bericht</ion-select-option>
              <ion-select-option value="dunning">Mahnung</ion-select-option>
              <ion-select-option value="other">Sonstiges</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Sprache</ion-label>
            <ion-select [ngModel]="tmpl.language" (ngModelChange)="onTemplateFieldChange('language', $event)">
              <ion-select-option value="de">Deutsch</ion-select-option>
              <ion-select-option value="fr">Français</ion-select-option>
              <ion-select-option value="it">Italiano</ion-select-option>
              <ion-select-option value="en">English</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Ausgabeformat</ion-label>
            <ion-select [ngModel]="tmpl.defaultOutputFormat" (ngModelChange)="onTemplateFieldChange('defaultOutputFormat', $event)">
              <ion-select-option value="pdf">PDF</ion-select-option>
              <ion-select-option value="docx">DOCX</ion-select-option>
              <ion-select-option value="html">HTML</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-label position="stacked">Beispieldaten (JSON)</ion-label>
            <ion-textarea
              [ngModel]="tmpl.sampleData"
              (ngModelChange)="onTemplateFieldChange('sampleData', $event)"
              class="editor-area"
              [rows]="8"
              autoGrow="false"
              placeholder='{}'
            />
          </ion-item>
        }
      }

      @if(activeTab() === 'html') {
        <ion-textarea
          [value]="draftVersion().html"
          (ionChange)="onVersionChange('html', $any($event).detail.value)"
          class="editor-area"
          [rows]="30"
          autoGrow="false"
          placeholder="&lt;!DOCTYPE html&gt;&lt;html&gt;..."
        />
      }

      @if(activeTab() === 'css') {
        <ion-textarea
          [value]="draftVersion().css"
          (ionChange)="onVersionChange('css', $any($event).detail.value)"
          class="editor-area"
          [rows]="30"
          autoGrow="false"
          placeholder="body { font-family: Arial, sans-serif; }"
        />
      }

      @if(activeTab() === 'preview') {
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <ion-button fill="outline" size="small" (click)="refreshPreview()" [disabled]="store.previewLoading()">
            @if(store.previewLoading()) {
              <ion-spinner name="crescent" slot="start" />
            } @else {
              <ion-icon src="{{ 'refresh' | svgIcon }}" slot="start" />
            }
            Vorschau aktualisieren
          </ion-button>
          @if(store.previewUrl()) {
            <ion-button fill="outline" size="small" (click)="downloadPreview()">
              <ion-icon src="{{ 'download' | svgIcon }}" slot="start" />
              Herunterladen
            </ion-button>
          }
        </div>
        @if(safePreviewUrl(); as url) {
          <iframe [src]="url" class="preview-frame" title="Vorschau"></iframe>
        } @else if(!store.previewLoading()) {
          <div class="preview-placeholder">
            <p>Klicke auf "Vorschau aktualisieren" um eine Vorschau zu generieren.</p>
          </div>
        }
      }
    </ion-content>
  `
})
export class TemplateEditPage {
  protected readonly store = inject(TemplateStore);
  private readonly templateService = inject(TemplateService);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  private readonly templateKey = signal<string>('');
  protected readonly activeTab = signal<EditorTab>('metadata');
  protected readonly saving = signal(false);

  // Local mutable copy of the template for editing
  private readonly _localTemplate = signal<TemplateModel | undefined>(undefined);

  private readonly _templateResource = rxResource({
    params: this.templateKey,
    stream: ({ params: key }) =>
      key ? this.templateService.read(key) : of(undefined),
  });

  private readonly _versions = rxResource({
    params: this.templateKey,
    stream: ({ params: key }) =>
      key ? this.templateService.listVersions(key) : of([]),
  });

  // Expose the local copy for the template; seed it from the resource when it loads
  protected readonly template = computed<TemplateModel | undefined>(() => {
    const local = this._localTemplate();
    if (local !== undefined) return local;
    return this._templateResource.value();
  });

  protected readonly draftVersion = linkedSignal<TemplateVersionModel>(() => {
    const tmpl = this._templateResource.value();
    const versions = this._versions.value() ?? [];
    if (!tmpl) return newTemplateVersion(1);
    const draft = tmpl.draftVersion;
    if (draft) {
      return versions.find((v: TemplateVersionModel) => v.version === draft) ?? newTemplateVersion(draft);
    }
    return newTemplateVersion((tmpl.currentVersion ?? 0) + 1);
  });

  protected readonly safePreviewUrl = computed((): SafeResourceUrl | null => {
    const url = this.store.previewUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  constructor() {
    effect(() => {
      const key = this.route.snapshot.paramMap.get('templateKey');
      if (key) this.templateKey.set(key);
    }, { allowSignalWrites: true });

    // Seed _localTemplate from resource once it loads
    effect(() => {
      const loaded = this._templateResource.value();
      if (loaded && this._localTemplate() === undefined) {
        this._localTemplate.set(safeStructuredClone(loaded) ?? undefined);
      }
    }, { allowSignalWrites: true });
  }

  protected onTemplateFieldChange(field: keyof TemplateModel, value: unknown): void {
    const current = this.template();
    if (!current) return;
    const cloned = safeStructuredClone(current);
    if (!cloned) return;
    (cloned as unknown as Record<string, unknown>)[field as string] = value;
    this._localTemplate.set(cloned);
  }

  protected onVersionChange(field: 'html' | 'css', value: string): void {
    const v = safeStructuredClone(this.draftVersion());
    if (!v) return;
    v[field] = value;
    this.draftVersion.set(v);
  }

  protected async saveDraft(): Promise<void> {
    this.saving.set(true);
    try {
      const tmpl = this.template();
      if (tmpl) await this.store.updateTemplate(tmpl);
      await this.store.saveDraft(this.templateKey(), this.draftVersion());
    } finally {
      this.saving.set(false);
    }
  }

  protected async publish(): Promise<void> {
    await this.saveDraft();
    await this.store.openPublishDialog(this.templateKey(), this.draftVersion().version);
  }

  protected async refreshPreview(): Promise<void> {
    const tmpl = this.template();
    await this.store.generatePreview(
      this.templateKey(),
      this.draftVersion(),
      tmpl?.sampleData ?? '{}'
    );
  }

  protected downloadPreview(): void {
    const url = this.store.previewUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `preview-${this.templateKey()}.pdf`;
    a.click();
  }
}
