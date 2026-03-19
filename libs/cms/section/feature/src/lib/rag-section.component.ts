import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
    IonButton, IonCard, IonCardContent, IonIcon, IonInput,
    IonItem, IonLabel, IonList, IonNote, IonSpinner, IonText,
} from '@ionic/angular/standalone';

import { OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { TranslatePipe } from '@bk2/shared-i18n';
import { RagConfig, SectionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { hasRole } from '@bk2/shared-util-core';

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
            white-space: pre-wrap;
        }
        .sources { padding: 4px 14px 0; }
        .sources a { font-size: 0.78rem; color: var(--ion-color-medium); display: flex; align-items: center; gap: 4px; text-decoration: none; }
        .sources a:hover { text-decoration: underline; }
        .sources ion-icon { font-size: 0.9rem; flex-shrink: 0; }
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
        AsyncPipe, FormsModule,
        OptionalCardHeaderComponent, SpinnerComponent, TranslatePipe,
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
                            [placeholder]="'@cms.rag.placeholder' | translate | async"
                            [disabled]="ragStore.isLoading()"
                            (keyup.enter)="submit()"
                            fill="outline"
                            clearInput="true"
                        />

                        <!-- Submit -->
                        <ion-button
                            (click)="submit()"
                            [disabled]="!searchTerm().trim() || ragStore.isLoading()"
                            fill="solid"
                            shape="round"
                        >
                            @if (ragStore.isLoading()) {
                                <ion-spinner slot="icon-only" name="crescent" />
                            } @else {
                                <ion-icon slot="icon-only" src="{{ 'search' | svgIcon }}" />
                            }
                        </ion-button>

                        <!-- Clear chat history -->
                        @if (ragStore.hasHistory()) {
                            <ion-button fill="clear" (click)="ragStore.reset()">
                                <ion-icon slot="icon-only" src="{{ 'close_cancel' | svgIcon }}" />
                            </ion-button>
                        }

                        <!-- Add document (edit mode + contentAdmin only) -->
                        @if (editMode() && isContentAdmin()) {
                            <ion-button fill="clear" (click)="ragStore.addDocument()">
                                <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
                            </ion-button>
                        }
                    </div>

                    <!-- RAG document list (edit mode + contentAdmin only) -->
                    @if (editMode() && isContentAdmin() && ragStore.ragDocuments().length > 0) {
                        <ion-list lines="inset">
                            @for (doc of ragStore.ragDocuments(); track doc.bkey) {
                                <ion-item>
                                    <ion-icon slot="start" src="{{ 'document' | svgIcon }}" />
                                    <ion-label>
                                        <p>{{ doc.title || doc.fullPath }}</p>
                                        <ion-note>{{ doc.mimeType }}</ion-note>
                                    </ion-label>
                                    <ion-button slot="end" fill="clear" color="danger" (click)="ragStore.deleteDocument(doc)">
                                        <ion-icon slot="icon-only" src="{{ 'trash_delete' | svgIcon }}" />
                                    </ion-button>
                                </ion-item>
                            }
                        </ion-list>
                    }

                    <!-- Query error -->
                    @if (ragStore.error(); as err) {
                        <ion-text color="danger">
                            <p class="error-text">{{ err }}</p>
                        </ion-text>
                    }

                    <!-- Chat history (newest first) -->
                    @if (ragStore.hasHistory()) {
                        <div class="chat-list">
                            @for (entry of reversedChatEntries(); track $index) {
                                <div class="chat-entry">
                                    <div class="question-bubble">{{ entry.question }}</div>
                                    <div class="answer-bubble">{{ entry.answer }}</div>
                                    @if (entry.sources.length > 0) {
                                        <div class="sources">
                                            @for (source of entry.sources; track source.uri) {
                                                <a [href]="source.url" target="_blank" rel="noopener">
                                                    <ion-icon src="{{ 'document' | svgIcon }}" />
                                                    {{ source.title }}
                                                </a>
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
    protected readonly ragStore = inject(RagStore);

    public section = input<SectionModel>();
    public editMode = input<boolean>(false);

    protected readonly title = computed(() => this.section()?.title);
    protected readonly subTitle = computed(() => this.section()?.subTitle);
    protected readonly config = computed(() => this.section()?.properties as RagConfig | undefined);
    protected readonly storeName = computed(() => this.config()?.storeName ?? '');
    protected readonly isContentAdmin = computed(() => hasRole('contentAdmin', this.ragStore.currentUser()));
    protected readonly reversedChatEntries = computed(() => [...this.ragStore.chatEntries()].reverse());

    protected searchTerm = signal('');

    constructor() {
        effect(() => {
            this.ragStore.setStoreName(this.storeName());
        });
    }

    protected submit(): void {
        const term = this.searchTerm().trim();
        if (!term || this.ragStore.isLoading()) return;
        this.searchTerm.set('');
        this.ragStore.query(term);
    }
}
