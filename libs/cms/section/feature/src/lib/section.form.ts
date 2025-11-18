import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, model, output, signal } from '@angular/core';
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
import { newTable, SectionFormModel, sectionFormValidations } from '@bk2/cms-section-util';

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
    [formValue]="vm()"
    [suite]="suite" 
    (dirtyChange)="dirtyChange.set($event)"
    (formValueChange)="onValueChange($event)">

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
                <ion-label>{{ '@content.section.default.type' | translate | async }}: {{ vm().type }}</ion-label>
              </ion-item>
              @if(bkey(); as bkey) {
                <ion-item lines="none">
                  <ion-label>Section Key: {{ bkey }}</ion-label>
                  <bk-button-copy [value]="bkey" />
                </ion-item>
              }
              <bk-text-input name="name" [value]="vm().name ?? ''" [readOnly]="isReadOnly()" [showHelper]=true />
              <bk-error-note [errors]="nameErrors()" />
                
              <bk-cat-select [category]="roles()!" selectedItemName="roleNeeded()" [withAll]="false" [readOnly]="isReadOnly()" (changed)="onChange('roleNeeded', $event)" />
            </ion-card-content>
          </ion-card>
        </ion-col>
      </ion-row>

      <!-- section specific settings must be defined within ion-row -->
      @switch(vm().type) {
        @case('album') { 
          <bk-album-section-config [vm]="vm()" (changed)="onChange()" />
          <bk-image-config-form [vm]="vm()" />
        }
        @case('article') {
          <bk-single-image [vm]="vm()" />
          <bk-article-section-config [vm]="vm()" />
        }
        @case('gallery') {
          <bk-image-list [vm]="vm()" />
          <bk-image-config-form [vm]="vm()" />
        }             
        @case('hero') {
          <ion-row>
            <ion-col size="12">
              <ion-label>{{ '@content.section.forms.imageConfig.heroInfo' | translate | async }}</ion-label>
            </ion-col>
          </ion-row>
          <bk-image-list [vm]="vm()" />
        }
        @case('map') {
          <bk-map-section-form [vm]="vm()" />
        }
        @case('peopleList') {
          <bk-people-list-form [vm]="vm()" (changed)="onChange()" (selectClicked)="selectPerson()" />
        }
        @case('slider') {
          <bk-image-list [vm]="vm()" />
          <bk-image-config-form [vm]="vm()" />
        }
        @case('video') {
          <bk-video-section-form [vm]="vm()" />
        }
        @case('button') {
          <bk-button-section-config [vm]="vm()" />
        }
        @case('table') {
          <bk-table-section-form [table]="table()!" (changed)="onChange('table', $event)" />  
        }
        @case('iframe') {     
          <bk-iframe-section-form [vm]="vm()" />
        }
        <!-- tbd: not yet implemented: Calendar, List, Chart -->
      }
    </ion-grid>
    @if(hasRole('privileged')) {
      <bk-chips chipName="tag" [storedChips]="vm().tags ?? ''" [readOnly]="isReadOnly()" [allChips]="sectionTags()" />
    }
    @if(hasRole('admin')) {
      <bk-notes [value]="vm().description ?? ''" [readOnly]="isReadOnly()" />
    }
  </form>
  `
})
export class SectionFormComponent {
  protected modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  public readonly vm = model.required<SectionFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly sectionTags = input.required<string>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => this.readOnly());
  
  public validChange = output<boolean>();
  protected dirtyChange = signal(false);
  
  protected readonly suite = sectionFormValidations;
  private readonly validationResult = computed(() => sectionFormValidations(this.vm()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected roles = computed(() => this.appStore.getCategory('roles'));

  public table = computed(() => this.vm().properties?.table ?? newTable());
  public icon = computed(() => this.vm().properties?.icon ?? newIcon());
  public button = computed(() => this.vm().properties?.button ?? newButton()); 
  protected roleNeeded = computed(() => this.vm().roleNeeded ?? DEFAULT_ROLE);
  protected bkey = computed(() => this.vm().bkey ?? '');
  protected persons = computed(() => this.vm().properties?.persons ?? []);

  public viewPositions = ViewPositions;

  protected onValueChange(value: SectionFormModel): void {
    this.vm.update((vm) => ({...vm, ...value}));
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
  }

  protected onChange(fieldName?: string, $event?: string | string[] | number | Table): void {
    if (fieldName) {
      this.vm.update((vm) => ({ ...vm, [fieldName]: $event }));
    }
    debugFormErrors('SectionForm (onChange)', this.validationResult().errors, this.currentUser());
    this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
    this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());
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
        this.vm.update((vm) => ({ ...vm, properties: { ...vm.properties, persons } }));
        debugFormErrors('SectionForm (modal)', this.validationResult().errors, this.currentUser());
        this.dirtyChange.set(true); // it seems, that vest is not updating dirty by itself for this change
        this.validChange.emit(this.validationResult().isValid() && this.dirtyChange());    
      }
    }
  }
}
