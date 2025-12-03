import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { ViewPositions } from '@bk2/shared-categories';
import { AppStore, PersonSelectModalComponent } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { newButton, newIcon, RoleName, Table, UserModel } from '@bk2/shared-models';
import { ButtonCopyComponent, CategorySelectComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { debugFormErrors, hasRole, isPerson } from '@bk2/shared-util-core';

import { AlbumSectionConfigComponent, ArticleSectionConfigComponent, ButtonSectionConfigComponent, IframeSectionFormComponent, ImageConfigFormComponent, MapSectionFormComponent, PeopleListFormComponent, TableSectionFormComponent, VideoSectionFormComponent } from '@bk2/cms-section-ui';
import { newTable, SECTION_FORM_SHAPE, SectionFormModel, sectionFormValidations } from '@bk2/cms-section-util';

import { ImageListComponent } from './image-list.component';
import { SingleImageComponent } from './single-image.component';
import { DEFAULT_ROLE } from '@bk2/shared-constants';

@Component({
  selector: 'bk-section-form',
  standalone: true,
  imports: [
    vestForms, FormsModule,
    TranslatePipe, AsyncPipe,
    ChipsComponent, NotesInputComponent, TextInputComponent, CategorySelectComponent,
    ImageConfigFormComponent, SingleImageComponent,
    IframeSectionFormComponent, ImageListComponent, ErrorNoteComponent,
    MapSectionFormComponent, TableSectionFormComponent, ButtonSectionConfigComponent,
    VideoSectionFormComponent, PeopleListFormComponent, ArticleSectionConfigComponent,
    IonGrid, IonRow, IonCol, IonLabel, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem,
    ButtonCopyComponent, AlbumSectionConfigComponent

],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">

    <ion-grid>
      <!---------------------------------------------------
      CONTENT 
      --------------------------------------------------->
      <ion-row>
        <ion-col size="12">
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ '@content.section.forms.title' | translate | async }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-item lines="none">
                <ion-label>{{ '@content.section.default.type' | translate | async }}: {{ formData().type }}</ion-label>
              </ion-item>
              @if(bkey(); as bkey) {
                <ion-item lines="none">
                  <ion-label>Section Key: {{ bkey }}</ion-label>
                  <bk-button-copy [value]="bkey" />
                </ion-item>
              }
              <bk-text-input name="name" [value]="formData().name" [readOnly]="isReadOnly()" [showHelper]=true />
              <bk-error-note [errors]="nameErrors()" />
                
              <bk-cat-select [category]="roles()!" selectedItemName="roleNeeded()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onFieldChange('roleNeeded', $event)" />
            </ion-card-content>
          </ion-card>
        </ion-col>
      </ion-row>

      <!-- section specific settings must be defined within ion-row -->
      @switch(formData().type) {
        @case('album') { 
          <bk-album-section-config [vm]="formData()" (changed)="onFieldChange()" />
          <bk-image-config-form [vm]="formData()" />
        }
        @case('article') {
          <bk-single-image [vm]="formData()" />
          <bk-article-section-config [vm]="formData()" />
        }
        @case('gallery') {
          <bk-image-list [vm]="formData()" />
          <bk-image-config-form [vm]="formData()" />
        }             
        @case('hero') {
          <ion-row>
            <ion-col size="12">
              <ion-label>{{ '@content.section.forms.imageConfig.heroInfo' | translate | async }}</ion-label>
            </ion-col>
          </ion-row>
          <bk-image-list [vm]="formData()" />
        }
        @case('map') {
          <bk-map-section-form [vm]="formData()" />
        }
        @case('peopleList') {
          @if(currentUser(); as currentUser) {
          <bk-people-list-form [vm]="formData()" [currentUser]="currentUser" (changed)="onFieldChange()" (selectClicked)="selectPerson()" />
          }
        }
        @case('slider') {
          <bk-image-list [vm]="formData()" />
          <bk-image-config-form [vm]="formData()" />
        }
        @case('video') {
          <bk-video-section-form [vm]="formData()" />
        }
        @case('button') {
          <bk-button-section-config [vm]="formData()" />
        }
        @case('table') {
          <bk-table-section-form [table]="table()!" (changed)="onFieldChange('table', $event)" />  
        }
        @case('iframe') {     
          <bk-iframe-section-form [vm]="formData()" />
        }
        <!-- tbd: not yet implemented: Calendar, List, Chart -->
      }
    </ion-grid>
    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="formData().tags" [readOnly]="isReadOnly()" [allChips]="allTags()" />
    }
    @if(hasRole('admin')) {
      <bk-notes [value]="formData().description" [readOnly]="isReadOnly()" />
    }
  </form>
  `
})
export class SectionFormComponent {
  protected modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public readonly formData = model.required<SectionFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly allTags = input.required<string>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => this.readOnly());
  
  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  
  // validation and errors
  protected readonly suite = sectionFormValidations;
  protected readonly shape = SECTION_FORM_SHAPE;
  private readonly validationResult = computed(() => sectionFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected roles = computed(() => this.appStore.getCategory('roles'));
  public table = computed(() => this.formData().properties?.table ?? newTable());
  public icon = computed(() => this.formData().properties?.icon ?? newIcon());
  public button = computed(() => this.formData().properties?.button ?? newButton()); 
  protected roleNeeded = computed(() => this.formData().roleNeeded ?? DEFAULT_ROLE);
  protected bkey = computed(() => this.formData().bkey ?? '');
  protected persons = computed(() => this.formData().properties?.persons ?? []);

  // passing constants to template
  public viewPositions = ViewPositions;

  constructor() {
    effect(() => {
      this.valid.emit(this.validationResult().isValid());
    });
  }

  protected onFormChange(value: SectionFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('SectionForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName?: string, $event?: string | string[] | number | Table): void {
    if (fieldName) {
      this.dirty.emit(true);
      this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
      debugFormErrors('SectionForm.onFieldChange', this.validationResult().errors, this.currentUser());
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  public async selectPerson(): Promise<void> {
    const modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isPerson(data, this.appStore.env.tenantId)) {
        const persons = this.persons();
        persons.push({
          key: data.bkey,
          name1: data.firstName,
          name2: data.lastName,
          label: '',
          modelType: 'person'
        });
        this.formData.update((vm) => ({ ...vm, properties: { ...vm.properties, persons } }));
        debugFormErrors('SectionForm (modal)', this.validationResult().errors, this.currentUser());
      }
    }
  }
}
