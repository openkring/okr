import { Component, computed, inject, input, linkedSignal, model } from '@angular/core';

import { AlbumConfig, AlbumSection, ArticleSection, AvatarInfo, ButtonActionConfig, ButtonSection, ButtonStyle, CategoryListModel, ChatConfig, ChatSection, EDITOR_CONFIG_SHAPE, EditorConfig, EventsConfig, EventsSection, HeroSection, IconConfig, IframeConfig, IframeSection, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE, ImageConfig, ImageStyle, InvitationsConfig, InvitationsSection, MapConfig, MapSection, PeopleConfig, PeopleSection, ResponsibilityConfig, ResponsibilitySection, RoleName, SectionModel, SectionModelName, SliderSection, TableGrid, TableSection, TableStyle, TrackerConfig, TrackerSection, UserModel, VideoConfig, VideoSection } from '@bk2/shared-models';
import { Chips, ImageConfigEdit, NotesInput } from '@bk2/shared-ui';
import { coerceBoolean, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_LABEL, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';
import { ModelSelectService } from '@bk2/shared-feature';

import { SectionConfiguration } from './section-configuration';
import { EditorConfiguration } from './editor-configuration';
import { ImageStyleConfiguration } from './image-style-configuration';
import { AlbumConfiguration } from './album-configuration';
import { IframeConfiguration } from './iframe-configuration';
import { PeopleConfiguration } from './people-configuration';
import { ResponsibilityConfiguration } from './responsibility-configuration';
import { VideoConfiguration } from './video-configuration';
import { ButtonStyleConfiguration } from './button-style-configuration';
import { ButtonActionConfiguration } from './button-action-configuration';
import { IconConfiguration } from './icon-configuration';
import { ChatConfiguration } from './chat-configuration';
import { MapConfiguration } from './map-configuration';
import { TableGridConfiguration } from './table-grid-configuration';
import { TableStyleConfiguration } from './table-style-configuration';
import { TableBody } from './table-body';
import { EventsConfiguration } from './events-configuration';
import { InvitationsConfiguration } from './invitations-configuration';
import { ImagesConfiguration } from './images-configuration';
import { TableHeader } from './table-header';
import { TrackerConfiguration } from './tracker-configuration';

@Component({
  selector: 'bk-section-form',
  standalone: true,
  imports: [
    Chips, ImageConfigEdit, NotesInput,
    SectionConfiguration, EditorConfiguration, ImageStyleConfiguration, AlbumConfiguration,
    IframeConfiguration, PeopleConfiguration, ResponsibilityConfiguration, VideoConfiguration, 
    ButtonStyleConfiguration, ButtonActionConfiguration, IconConfiguration, ChatConfiguration, 
    MapConfiguration, TrackerConfiguration, TableGridConfiguration,  TableStyleConfiguration, TableHeader, 
    TableBody, EventsConfiguration, InvitationsConfiguration, ImagesConfiguration
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <bk-section-config [(formData)]="formData" [currentUser]="currentUser()" [roles]="roles()" [states]="states()" [readOnly]="isReadOnly()" />

      @switch (formData().type) {
        @case('album') {
          @if(albumConfig(); as albumConfig) {
            <bk-album-config [formData]="albumConfig" (formDataChange)="onAlbumConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }

        @case('article') {
          @if(content(); as content) {
            <bk-editor-config [formData]="content" (formDataChange)="onContentChange($event)" [readOnly]="isReadOnly()" />
          }
          <bk-images-config [images]="images()" (imagesChange)="onImagesChange($event)" [storagePath]="storagePath()" [currentUser]="currentUser()" [readOnly]="isReadOnly()" />
          @if(imageStyle(); as imageStyle) {
            <bk-image-style [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)" [readOnly]="isReadOnly()" />
          }
        }

        @case('button') {
          @if(content(); as content) {
            <bk-editor-config [formData]="content" (formDataChange)="onContentChange($event)" [readOnly]="isReadOnly()" />
          } 
          @if(buttonActionConfig(); as buttonActionConfig) {
            <bk-button-action [formData]="buttonActionConfig" (formDataChange)="onButtonActionChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(iconConfig(); as iconConfig) {
            <bk-icon-config [formData]="iconConfig" (formDataChange)="onIconConfigChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(buttonStyle(); as buttonStyle) {
            <bk-button-style [formData]="buttonStyle" (formDataChange)="onButtonStyleChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(imageStyle(); as imageStyle) {
            <bk-image-style [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('cal') {
          <!-- Calendar-specific, e.g., calendarOptions -->
        }
        @case('chart') {
          <!-- Chart-specific, e.g., chartOptions -->
        }
        @case('chat') {
          @if(chatConfig(); as chatConfig) {
            <bk-chat-config [formData]="chatConfig" (formDataChange)="onChatConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('events') {
          @if(eventsConfig(); as eventsConfig) {
            <bk-events-config [formData]="eventsConfig" (formDataChange)="onEventsConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('invitations') {
          @if(invitationsConfig(); as invitationsConfig) {
            <bk-invitations-config [formData]="invitationsConfig" (formDataChange)="onInvitationsConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('hero') {
          @if(logoConfig(); as logoConfig) {
            <bk-image-config [formData]="logoConfig" (formDataChange)="onImageConfigChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(heroConfig(); as heroConfig) {
            <bk-image-config [formData]="heroConfig" (formDataChange)="onImageConfigChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(imageStyle(); as imageStyle) {
            <bk-image-style [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)" [readOnly]="isReadOnly()" />
          }

        }
        @case('iframe') {
          @if(iframeConfig(); as iframeConfig) {
            <bk-iframe-config [formData]="iframeConfig" (formDataChange)="onIframeConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('map') {
          @if(mapConfig(); as mapConfig) {
            <bk-map-config [formData]="mapConfig" (formDataChange)="onMapConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('people') {
          @if(peopleConfig(); as peopleConfig) {
              <bk-people-config
                [formData]="peopleConfig"
                (formDataChange)="onPeopleConfigChange($event)"
                (selectClicked)="selectPerson()"
                (groupSelectClicked)="selectGroup()"
                (responsibilitySelectClicked)="selectResponsibility()"
                [currentUser]="currentUser()"
                [readOnly]="isReadOnly()"
              />
          }
        }
        @case('responsibility') {
          @if(responsibilityConfig(); as responsibilityConfig) {
            <bk-responsibility-config
              [formData]="responsibilityConfig"
              (formDataChange)="onResponsibilityConfigChange($event)"
              [currentUser]="currentUser()"
              [readOnly]="isReadOnly()"
            />
          }
        }
        @case('slider') {
          @if(images(); as images) {
            <bk-images-config [images]="images" (imagesChange)="onImagesChange($event)" [storagePath]="storagePath()" [currentUser]="currentUser()" [readOnly]="isReadOnly()" />
          }
          @if(imageStyle(); as imageStyle) {
            <bk-image-style [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('table') {
          @if(tableGrid(); as tableGrid) {
            <bk-table-grid [formData]="tableGrid" (formDataChange)="onTableGridChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(headerStyle(); as headerStyle) {
            <bk-table-style name="header" [formData]="headerStyle" (formDataChange)="onHeaderStyleChange($event)" [readOnly]="isReadOnly()" />
          }
          @if(bodyStyle(); as bodyStyle) {
            <bk-table-style name="body" [formData]="bodyStyle" (formDataChange)="onBodyStyleChange($event)" [readOnly]="isReadOnly()" />
          }
          <bk-table-header [formData]="headerData()" (formDataChange)="onTableHeaderChange($event)" [readOnly]="isReadOnly()" />
          <bk-table-body [formData]="bodyData()" (formDataChange)="onTableBodyChange($event)" [readOnly]="isReadOnly()" />
        }
        @case('tracker') {
          @if(trackerConfig(); as trackerConfig) {
            <bk-tracker-config [formData]="trackerConfig" (formDataChange)="onTrackerConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }
        @case('video') {
          @if(videoConfig(); as videoConfig) {
            <bk-video-config [formData]="videoConfig" (formDataChange)="onVideoConfigChange($event)" [readOnly]="isReadOnly()" />
          }
        }
      }
    
      @if(hasRole('privileged')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [readOnly]="isReadOnly()" [allChips]="allTags()" />
      }
      @if(hasRole('admin')) {
        <bk-notes-input [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    }
  `
})
/** 
 * Because vest validation is type specific and we want to have a generic section form component for all union types, we do not use vest here.
 */
export class SectionForm {
  private readonly modelSelectService = inject(ModelSelectService);

  // inputs
  public formData = model.required<SectionModel>();
  public currentUser = input.required<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly tenantId = input.required<string>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // derived linked signals
  protected sectionKey = computed(() => this.formData().bkey);
  protected directory = linkedSignal(() => this.formData().type === 'album' ? (this.formData() as any).directory ?? '' : '' );
  protected content = linkedSignal(() => this.getContent());
  protected albumConfig = linkedSignal(() => this.getAlbumConfig());
  protected images = linkedSignal(() => this.getImages());
  protected storagePath = computed(() => `tenant/${this.tenantId()}/section/${this.sectionKey()}`);
  protected imageStyle = linkedSignal(() => this.getImageStyle());
  protected buttonActionConfig = linkedSignal(() => this.getButtonActionConfig());
  protected buttonStyle = linkedSignal(() => this.getButtonStyle());
  protected iconConfig = linkedSignal(() => this.getIconConfig());
  protected chatConfig = linkedSignal(() => this.getChatConfig());
  protected eventsConfig = linkedSignal(() => this.getEventsConfig());
  protected invitationsConfig = linkedSignal(() => this.getInvitationsConfig());
  protected logoConfig = linkedSignal(() => this.getLogoConfig());
  protected heroConfig = linkedSignal(() => this.getHeroConfig());
  protected iframeConfig = linkedSignal(() => this.getIframeConfig());
  protected mapConfig = linkedSignal(() => this.getMapConfig());
  protected peopleConfig = linkedSignal(() => this.getPeopleConfig());
  protected responsibilityConfig = linkedSignal(() => this.getResponsibilityConfig());
  protected headerData = linkedSignal(() => this.getHeaderData());
  protected bodyData = linkedSignal(() => this.getBodyData());
  protected tableGrid = linkedSignal(() => this.getTableGrid());
  protected headerStyle = linkedSignal(() => this.getHeaderStyle());
  protected bodyStyle = linkedSignal(() => this.getBodyStyle());
  
  protected trackerConfig = linkedSignal(() => this.getTrackerConfig());
  protected videoConfig = linkedSignal(() => this.getVideoConfig());
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean | AvatarInfo[]): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
  
  protected onSectionChange(section: SectionModel): void {
    if (section && section.type === 'article') {
    this.formData.update((vm) => ({...vm, ...section}));
    debugFormModel('SectionForm.onFormChange', this.formData(), this.currentUser());
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  /************************************** property getters (section type specific) *********************************************** */
  // used by multiple sections
  private getContent(): EditorConfig | undefined {
    switch (this.formData().type) {
      case 'article': return (this.formData() as ArticleSection).content || EDITOR_CONFIG_SHAPE;
      case 'people': return (this.formData() as PeopleSection).content || EDITOR_CONFIG_SHAPE;
      case 'button': return (this.formData() as ButtonSection).content || EDITOR_CONFIG_SHAPE;
      default: 
        console.log(`SectionForm.getContent: no content for section type ${this.formData().type}`);
        return undefined;
    }
  }

  private getAlbumConfig(): AlbumConfig | undefined {
    if (this.formData().type === 'album') {
      return ((this.formData() as AlbumSection).properties as AlbumConfig);
    }
  }

  private getImages(): ImageConfig[] {
    switch (this.formData().type) {
      case 'article': return (this.formData() as ArticleSection).properties.images || [];
      case 'slider': return (this.formData() as SliderSection).properties.images || [];
      default: return [];
    }
  }

  private getImageStyle(): ImageStyle | undefined {
    switch (this.formData().type) {
      case 'article': return (this.formData() as ArticleSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      case 'button': return (this.formData() as ButtonSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      case 'hero': return (this.formData() as HeroSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      case 'slider': return (this.formData() as SliderSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      default: return undefined;
    }
  }

  private getButtonActionConfig(): ButtonActionConfig | undefined {
    if (this.formData().type === 'button') {
      return ((this.formData() as ButtonSection).properties.action);
    }
  }

  private getIconConfig(): IconConfig | undefined {
    if (this.formData().type === 'button') {
      return ((this.formData() as ButtonSection).properties.icon);
    }
  }

  private getButtonStyle(): ButtonStyle | undefined {
    if (this.formData().type === 'button') {
      return ((this.formData() as ButtonSection).properties.style);
    }
  }

  private getChatConfig(): ChatConfig | undefined {
    if (this.formData().type === 'chat') {
      return ((this.formData() as ChatSection).properties as ChatConfig);
    }
  }

  private getEventsConfig(): EventsConfig | undefined {
    if (this.formData().type === 'events') {
      return ((this.formData() as any).properties as EventsConfig);
    }
  }

  private getInvitationsConfig(): InvitationsConfig | undefined {
    if (this.formData().type === 'invitations') {
      return ((this.formData() as any).properties as InvitationsConfig);
    }
  }

  private getLogoConfig(): ImageConfig | undefined {
    switch (this.formData().type) {
      case 'hero': return (this.formData() as HeroSection).properties.logo || IMAGE_CONFIG_SHAPE;
      default: return undefined;
    }
  }

  private getHeroConfig(): ImageConfig | undefined {
    switch (this.formData().type) {
      case 'hero': return (this.formData() as HeroSection).properties.hero || IMAGE_CONFIG_SHAPE;
      default: return undefined;
    }
  }

  private getIframeConfig(): IframeConfig | undefined {
    if (this.formData().type === 'iframe') {
      return ((this.formData() as IframeSection).properties as IframeConfig);
    }
  }

  private getMapConfig(): MapConfig | undefined {  
    if (this.formData().type === 'map') {
      return ((this.formData() as MapSection).properties as MapConfig);
    }
  }

  private getPeopleConfig(): PeopleConfig | undefined {
    if (this.formData().type === 'people') {
      return ((this.formData() as PeopleSection).properties as PeopleConfig);
    }
  }

  private getResponsibilityConfig(): ResponsibilityConfig | undefined {
    if (this.formData().type === 'responsibility') {
      return ((this.formData() as ResponsibilitySection).properties as ResponsibilityConfig);
    }
  }

  private getHeaderData(): string[] {
    if (this.formData().type === 'table') {
      return ((this.formData() as TableSection).properties.data?.header as string[]) || [];
    }
    return [];
  }

  private getBodyData(): string[] {
    if (this.formData().type === 'table') {
      return ((this.formData() as TableSection).properties.data?.body as string[]) || [];
    }
    return [];
  }

  private getTableGrid(): TableGrid | undefined {  
    if (this.formData().type === 'table') {
      return ((this.formData() as any).properties.grid as TableGrid);
    }
  }

  private getHeaderStyle(): TableStyle | undefined {  
    if (this.formData().type === 'table') {
      return ((this.formData() as any).properties.header as TableStyle);
    }
  }

  private getBodyStyle(): TableStyle | undefined {  
    if (this.formData().type === 'table') {
      return ((this.formData() as any).properties.body as TableStyle);
    }
  }

  private getTrackerConfig(): TrackerConfig | undefined {  
    if (this.formData().type === 'tracker') {
      return ((this.formData() as TrackerSection).properties as TrackerConfig);
    }
  }

  private getVideoConfig(): VideoConfig | undefined {
    if (this.formData().type === 'video') {
      return ((this.formData() as VideoSection).properties as VideoConfig);
    }
  }

  /************************************** property setters (section type specific) *********************************************** */
  protected onContentChange(content: EditorConfig): void {
    this.formData.set({ ...this.formData(), content: content });
  }

  protected onImagesChange(images: ImageConfig[]): void {
    const section = this.formData();
    if (section.type === 'article') {
      this.formData.set({ ...section, properties: { ...section.properties, images } } as ArticleSection);
    } else if (section.type === 'slider') {
      this.formData.set({ ...section, properties: { ...section.properties, images } } as SliderSection);
    }
  }

  protected onImageConfigChange(image: ImageConfig): void {
    const section = this.formData();
    if (section.type === 'article') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, image }
      } as ArticleSection);
    }
  }


  protected onLogoConfigChange(image: ImageConfig): void {
    const section = this.formData();
    if (section.type === 'hero') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, logo: image }
      } as HeroSection);
    }
  }

  protected onHeroConfigChange(image: ImageConfig): void {
    const section = this.formData();
    if (section.type === 'hero') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, hero: image }
      } as HeroSection);
    }
  }

  protected onImageStyleChange(imageStyle: ImageStyle): void {
    const section = this.formData();
    switch (section.type) {
      case 'article':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as ArticleSection);
        break;
      case 'button':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as ButtonSection);
        break;
      case 'hero':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as HeroSection);
        break;
      case 'slider':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as SliderSection);
        break;
    }
  }

  protected onAlbumConfigChange(config: AlbumConfig): void {
    const section = this.formData();
    if (section.type === 'album') {
      this.formData.set({
        ...section,
        properties: config
      } as AlbumSection);
    }
  }

  protected onButtonActionChange(config: ButtonActionConfig): void {
    const section = this.formData();
    if (section.type === 'button') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, action: config }
      } as ButtonSection);
    }
  }

  protected onButtonStyleChange(config: ButtonStyle): void {
    const section = this.formData();
    if (section.type === 'button') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, style: config }
      } as ButtonSection);
    }
  }

  protected onIconConfigChange(config: IconConfig): void {
    const section = this.formData();
    if (section.type === 'button') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, icon: config }
      } as ButtonSection);
    }
  }

  protected onChatConfigChange(config: any): void {
    const section = this.formData();
    if (section.type === 'chat') {
      this.formData.set({
        ...section,
        properties: config
      } as any);
    }
  }

  protected onEventsConfigChange(config: EventsConfig): void {
    const section = this.formData();
    if (section.type === 'events') {
      this.formData.set({
        ...section,
        properties: config
      } as EventsSection);
    }
  }

  protected onInvitationsConfigChange(config: InvitationsConfig): void {
    const section = this.formData();
    if (section.type === 'invitations') {
      this.formData.set({
        ...section,
        properties: config
      } as InvitationsSection);
    }
  }

  protected onIframeConfigChange(config: IframeConfig): void {
    const section = this.formData();
    if (section.type === 'iframe') {
      this.formData.set({
        ...section,
        properties: config
      } as IframeSection);
    }
  }

  protected onMapConfigChange(config: any): void {
    const section = this.formData();
    if (section.type === 'map') {
      this.formData.set({
        ...section,
        properties: config
      } as any);
    }
  }

  protected onPeopleConfigChange(config: PeopleConfig): void {
    const section = this.formData();
    if (section.type === 'people') {
      this.formData.set({ ...section, properties: config } as PeopleSection);
    }
  }

  protected onResponsibilityConfigChange(config: ResponsibilityConfig): void {
    const section = this.formData();
    if (section.type === 'responsibility') {
      this.formData.set({ ...section, properties: config } as ResponsibilitySection);
    }
  }

  protected onTableHeaderChange(data: string[]): void {
    const section = this.formData();
    if (section.type === 'table') {
      const currentData = section.properties.data || { header: [], values: [] };
      this.formData.set({
        ...section,
        properties: { ...section.properties, data: { ...currentData, header: data } }
      } as TableSection);
    }
  }

  protected onTableBodyChange(data: string[]): void {
    const section = this.formData();
    if (section.type === 'table') {
      const currentData = section.properties.data || { header: [], values: [] };
      this.formData.set({
        ...section,
        properties: { ...section.properties, data: { ...currentData, body: data } }
      } as TableSection);
    }
  }

  protected onTableGridChange(config: TableGrid): void {
    const section = this.formData();
    if (section.type === 'table') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, grid: config }
      } as TableSection);
    }
  }

  protected onHeaderStyleChange(config: TableStyle): void {
    const section = this.formData();
    if (section.type === 'table') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, header: config }
      } as TableSection);
    }
  }

  protected onBodyStyleChange(config: TableStyle): void {
    const section = this.formData();
    if (section.type === 'table') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, body: config }
      } as TableSection);
    }
  }

  protected onTrackerConfigChange(config: any): void {
    const section = this.formData();
    if (section.type === 'tracker') {
      this.formData.set({
        ...section,
        properties: config
      } as any);
    }
  }

  protected onVideoConfigChange(config: VideoConfig): void {
    const section = this.formData();
    if (section.type === 'video') {
      this.formData.set({
        ...section,
        properties: config
      } as VideoSection);
    }
  }

  /************************************** select person *********************************************** */
  public async selectPerson(): Promise<void> {
    const avatar = await this.modelSelectService.selectPersonAvatar('', DEFAULT_LABEL);
    if (avatar) {
      const currentConfig = this.peopleConfig();
      this.onPeopleConfigChange({
        ...currentConfig,
        persons: [...(currentConfig?.persons ?? []), avatar] } as PeopleConfig
      );
    }
  }

  public async selectGroup(): Promise<void> {
    const group = await this.modelSelectService.selectGroup();
    if (group) {
      this.onPeopleConfigChange({ ...this.peopleConfig(), groupId: group.bkey } as PeopleConfig);
    }
  }

  public async selectResponsibility(): Promise<void> {
    const responsibility = await this.modelSelectService.selectResponsibility();
    if (responsibility) {
      this.onPeopleConfigChange({ ...this.peopleConfig(), responsibilityId: responsibility.bkey } as PeopleConfig);
    }
  }
}