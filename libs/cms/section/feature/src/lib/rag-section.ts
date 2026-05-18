import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import { IonButton, IonCard, IonCardContent, IonIcon, IonInput, IonItem, IonLabel, IonList, IonNote, IonSpinner, IonText } from '@ionic/angular/standalone';

import { OptionalCardHeader, Spinner } from '@bk2/shared-ui';
import { DocumentModel, RagConfig, SectionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { hasRole } from '@bk2/shared-util-core';
import { DEFAULT_MIMETYPES } from '@bk2/shared-constants';

import { RagStore } from './rag-section.store';

@Component({
    selector: 'bk-rag-section',
    standalone: true,
    providers: [RagStore],
    styles: [`
        ion-card { padding: 0; margin: 0; border: 0; box-shadow: none !important; }
        .chat-list { display: flex; flex-direction: column; gap: 12px; padding: 8px 0; }
        .chat-entry { display: flex; flex-direction: column; gap: 6px; }
        .question-bubble {
            align-self: flex-end;
            background: var(--ion-color-primary);
            color: var(--ion-color-primary-contrast);
            border-radius: 16px 16px 4px 16px;
            padding: 8px 14px;
            max-width: 80%;
            font-size: 0.95rem;
        }
        .answer-bubble {
            align-self: flex-start;
            background: var(--ion-color-light);
            color: var(--ion-color-dark);
            border-radius: 16px 16px 16px 4px;
            padding: 8px 14px;
            max-width: 90%;
            font-size: 0.95rem;
        }
        .answer-bubble ::ng-deep p { margin: 0 0 0.5em; }
        .answer-bubble ::ng-deep p:last-child { margin-bottom: 0; }
        .answer-bubble ::ng-deep ul, .answer-bubble ::ng-deep ol { margin: 0.25em 0 0.5em 1.2em; padding: 0; }
        .answer-bubble ::ng-deep li { margin-bottom: 0.15em; }
        .answer-bubble ::ng-deep h1, .answer-bubble ::ng-deep h2, .answer-bubble ::ng-deep h3 { margin: 0.5em 0 0.25em; font-size: 1em; font-weight: 600; }
        .answer-bubble ::ng-deep code { background: rgba(0,0,0,0.08); border-radius: 3px; padding: 0 3px; font-family: monospace; font-size: 0.9em; }
        .answer-bubble ::ng-deep pre { background: rgba(0,0,0,0.08); border-radius: 6px; padding: 8px; overflow-x: auto; }
        .answer-bubble ::ng-deep pre code { background: none; padding: 0; }
        .answer-bubble ::ng-deep strong { font-weight: 600; }
        .answer-bubble ::ng-deep a { color: var(--ion-color-primary); }
        .sources { padding: 4px 14px 0; display: flex; flex-direction: column; gap: 2px; }
        .source-row { display: flex; align-items: center; gap: 4px; }
        .source-row a { font-size: 0.78rem; color: var(--ion-color-medium); display: flex; align-items: center; gap: 4px; text-decoration: none; flex: 1; }
        .source-row a:hover { text-decoration: underline; }
        .source-row ion-icon { font-size: 0.9rem; flex-shrink: 0; }
        .source-row ion-button { --padding-start: 4px; --padding-end: 4px; margin: 0; }
        .file-pick-label { cursor: pointer; display: flex; align-items: center; color: var(--ion-color-primary); padding: 4px; }
        .toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 0 4px;
        }
        .toolbar ion-input { flex: 1; }
        .error-text { font-size: 0.85rem; padding: 4px 0; }
    `],
    imports: [
        FormsModule,
        OptionalCardHeader, Spinner,
        IonCard, IonCardContent, IonInput, IonButton, IonIcon,
        IonItem, IonLabel, IonList, IonNote, IonSpinner, IonText,
        SvgIconPipe,
    ],
    template: `
        @if (section(); as section) {
            <ion-card>
                <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
                <ion-card-content>

                    <div class="toolbar">
                        <!-- Search input -->
                        <ion-input
                            [(ngModel)]="searchTerm"
                            [placeholder]="placeholder()"
                            [disabled]="store.isLoading()"
                            (keyup.enter)="submit()"
                            fill="outline"
                            clearInput="true"
                        />

                        <!-- Submit -->
                        <ion-button
                            (click)="submit()"
                            [disabled]="!searchTerm().trim() || isLoading()"
                            fill="solid"
                            shape="round"
                        >
                            @if (isLoading()) {
                                <ion-spinner slot="icon-only" name="crescent" />
                            } @else {
                                <ion-icon slot="icon-only" src="{{ 'search' | svgIcon }}" />
                            }
                        </ion-button>

                        <!-- Clear chat history -->
                        @if (hasHistory()) {
                            <ion-button fill="clear" (click)="reset()">
                                <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
                            </ion-button>
                        }

                        <!-- Add document (edit mode + contentAdmin only).
                             <label>+<input> bypasses Ionic's shadow-DOM re-dispatch
                             so Safari receives a trusted user gesture for the file dialog. -->
                        @if (editMode() && isContentAdmin()) {
                            <input id="rag-file-input" type="file" multiple
                                   [accept]="acceptMimeTypes"
                                   style="display:none"
                                   (change)="onFilesSelected($event)" />
                            <label for="rag-file-input" class="file-pick-label">
                                <ion-icon src="{{ 'add-circle' | svgIcon }}" />
                            </label>
                        }
                    </div>

                    <!-- RAG document list (edit mode + contentAdmin only) -->
                    @if (editMode() && isContentAdmin() && documents().length > 0) {
                        <ion-list lines="inset">
                            @for (doc of documents(); track doc.bkey) {
                                <ion-item>
                                    <ion-icon slot="start" src="{{ 'document' | svgIcon }}" />
                                    <ion-label>
                                        <p>{{ doc.title || doc.fullPath }}</p>
                                        <ion-note>{{ doc.mimeType }}</ion-note>
                                    </ion-label>
                                    <ion-button slot="end" fill="clear" color="danger" (click)="deleteDocument(doc)">
                                        <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                                    </ion-button>
                                </ion-item>
                            }
                        </ion-list>
                    }

                    <!-- Query error -->
                    @if (error(); as err) {
                        <ion-text color="danger">
                            <p class="error-text">{{ err }}</p>
                        </ion-text>
                    }

                    <!-- Chat history (newest first) -->
                    @if (hasHistory()) {
                        <div class="chat-list">
                            @for (entry of reversedChatEntries(); track $index) {
                                <div class="chat-entry">
                                    <div class="question-bubble">{{ entry.question }}</div>
                                    <div class="answer-bubble" [innerHTML]="toHtml(entry.answer)"></div>
                                    @if (entry.sources.length > 0) {
                                        <div class="sources">
                                            @for (source of entry.sources; track source.uri) {
                                                <div class="source-row">
                                                    <a [href]="source.url" target="_blank" rel="noopener">
                                                        <ion-icon src="{{ 'document' | svgIcon }}" />
                                                        {{ source.title }}
                                                    </a>
                                                    <ion-button fill="clear" size="small" (click)="downloadFile(source)">
                                                        <ion-icon slot="icon-only" src="{{ 'download' | svgIcon }}" />
                                                    </ion-button>
                                                </div>
                                            }
                                        </div>
                                    }
                                </div>
                            }
                        </div>
                    }
                </ion-card-content>
            </ion-card>
        } @else {
            <bk-spinner />
        }
    `,
})
export class RagSectionComponent {
    protected readonly store = inject(RagStore);
    private readonly sanitizer = inject(DomSanitizer);

    // inputs
    public section = input<SectionModel>();
    public editMode = input<boolean>(false);

    // signals
    protected searchTerm = signal('');

    // computed
    protected placeholder = computed(() => this.store.i18n.placeholder());
    protected isLoading = computed(() => this.store.isLoading());
    protected hasHistory = computed(() => this.store.hasHistory());
    protected documents = computed(() => this.store.ragDocuments());
    protected error = computed(() => this.store.error());
    protected readonly title = computed(() => this.section()?.title);
    protected readonly subTitle = computed(() => this.section()?.subTitle);
    protected readonly config = computed(() => this.section()?.properties as RagConfig | undefined);
    protected readonly storeName = computed(() => this.config()?.storeName ?? '');
    protected readonly isContentAdmin = computed(() => hasRole('contentAdmin', this.store.currentUser()));
    protected readonly reversedChatEntries = computed(() => [...this.store.chatEntries()].reverse());

    // constants
    protected readonly acceptMimeTypes = DEFAULT_MIMETYPES.join(',');

    // constructor
    constructor() {
        effect(() => {
            this.store.setStoreName(this.storeName());
        });
    }

    // methods
    protected toHtml(markdown: string): SafeHtml {
        return this.sanitizer.bypassSecurityTrustHtml(marked.parse(markdown) as string);
    }

    protected async downloadFile(source: { title: string; url?: string }): Promise<void> {
        if (!source.url) return;
        const response = await fetch(source.url);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = source.title;
        anchor.click();
        URL.revokeObjectURL(objectUrl);
    }

    protected onFilesSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const files = Array.from(input.files ?? []);
        input.value = ''; // reset so the same file can be picked again
        this.store.addDocument(files);
    }

    protected submit(): void {
        const term = this.searchTerm().trim();
        if (!term || this.store.isLoading()) return;
        this.searchTerm.set('');
        this.store.query(term);
    }

    protected reset(): void {
        this.store.reset();
    }

    protected async deleteDocument(doc: DocumentModel): Promise<void> {
        await this.store.deleteDocument(doc);
    }
}
