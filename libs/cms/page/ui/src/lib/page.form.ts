import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { ContentStates, PageTypes } from '@bk2/shared-categories';
import { CaseInsensitiveWordMask } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { ContentState, PageType, RoleName, UserModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ButtonCopyComponent, CategoryComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, StringsComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';

import { PageFormModel, pageFormModelShape, pageFormValidations } from '@bk2/cms-page-util';


@Component({
  selector: 'bk-page-form',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    vestForms, FormsModule,
    ChipsComponent, NotesInputComponent, TextInputComponent, StringsComponent, ButtonCopyComponent, 
    ErrorNoteComponent, CategoryComponent,
    IonLabel, IonIcon, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonGrid, IonRow, IonCol
],
  template: `
    <form scVestForm
      [formShape]="shape"
      [formValue]="vm()"
      [suite]="suite" 
      (dirtyChange)="dirtyChange.set($event)"
      (formValueChange)="onValueChange($event)">

        <!---------------------------------------------------
        Sections 
        --------------------------------------------------->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@content.page.forms.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                @if(bkey(); as bkey) {
                  <ion-item lines="none">  
                    <ion-icon src="{{'login_enter' | svgIcon }}" (click)="gotoPage(bkey)" slot="start"/>
                    <ion-label>Page Key: {{ bkey }}</ion-label>
                    <bk-button-copy [value]="bkey" />
                  </ion-item>
                }
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="name" [value]="name()" (changed)="onChange('name', $event)" />
                <bk-error-note [errors]="nameErrors()" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="title" [value]="title()" (changed)="onChange('title', $event)" />
                <bk-error-note [errors]="titleErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat name="type" [value]="type()" [categories]="types" (changed)="onChange('type', $event)" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat name="state" [value]="state()" [categories]="states" (changed)="onChange('state', $event)" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- sections -->
      <bk-strings (changed)="onChange('sections', $event)"
          [strings]="sections()"
          [mask]="mask"
          [maxLength]="40"
          title="@content.page.forms.section.label"
          addLabel="@content.section.operation.add.label" />
          
      @if(hasRole('privileged')) {
        <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="pageTags()" (changed)="onChange('tags', $event)" />
      }
      @if(hasRole('admin')) {
        <bk-notes [value]="notes()" (changed)="onChange('notes', $event)" />
      }
    </form>
  `
})
export class PageFormComponent {
  private readonly router = inject(Router);
  private readonly modalController = inject(ModalController);

  public readonly vm = model.required<PageFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly pageTags = input.required<string>();
  
  protected bkey = computed(() => this.vm().bkey ?? '');
  protected sections = linkedSignal(() => this.vm().sections ?? []);
  protected name = computed(() => this.vm().name ?? '');
  protected title = computed(() => this.vm().title ?? '');
  protected type = computed(() => this.vm().type ?? PageType.Content);
  protected state = computed(() => this.vm().state ?? ContentState.Draft);
  protected tags = computed(() => this.vm().tags ?? '');
  protected notes = computed(() => this.vm().notes ?? '');

  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = pageFormValidations;
  protected readonly shape = pageFormModelShape;
  private readonly validationResult = computed(() => pageFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected titleErrors = computed(() => this.validationResult().getErrors('title'));

  protected mask = CaseInsensitiveWordMask;
  protected types = PageTypes;
  protected states = ContentStates;

  protected gotoPage(pageKey?: string): void {
    if (!pageKey)  return;
    this.modalController.dismiss(null, 'cancel');
    this.router.navigateByUrl(`/private/${pageKey}`);
  }

  protected onValueChange(value: PageFormModel): void {
    this.vm.update((_vm) => ({..._vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName: string, $event: string | string[] | number): void {
    this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('PageForm', this.validationResult().errors, this.currentUser());
    debugFormModel<PageFormModel>('PageForm', this.vm(), this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
