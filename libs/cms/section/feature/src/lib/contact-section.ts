import { Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { IonButton, IonCard, IonCardContent, IonIcon, IonNote } from '@ionic/angular';

import { ContactElement, ContactSection } from '@okr/shared-models';
import { OptionalCardHeader } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import {
  CONTACT_FORM_MODEL_SHAPE, ContactFormModel, getContactMailtoLink, getContactMapEmbedUrl, getTelLink,
  isContactElementVisible, normalizeContactConfig, SectionI18n
} from '@okr/cms-section-util';
import { ContactMessageForm } from '@okr/cms-section-ui';

import { SectionStore } from './section.store';
import { ContactDetailsService } from './contact-details.service';

/**
 * «So findest du uns»: an organization and a contact person, optionally a map of the
 * organization's address and a contact form, arranged in the rows and columns the editor laid
 * out. Columns share a row by their width (fr); below 640px of SECTION width (container query,
 * so it also holds in a narrow page column) every row stacks into one column.
 *
 * Contact data is read live from the address book projection — each viewer sees what they may.
 * The form stores nothing: it opens the visitor's mail program with a prefilled message to the
 * contact person (or, without one, the organization).
 */
@Component({
  selector: 'okr-contact-section',
  standalone: true,
  imports: [OptionalCardHeader, ContactMessageForm, SvgIconPipe, IonCard, IonCardContent, IonButton, IonIcon, IonNote],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }

    .contact { container-type: inline-size; padding: 16px 0; }
    .row { display: grid; gap: 24px 40px; margin-bottom: 24px; }
    .row:last-child { margin-bottom: 0; }
    @container (width < 640px) { .row { grid-template-columns: 1fr !important; gap: 20px; } }
    .col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

    .title { margin: 0; font-size: clamp(1.6rem, 3.5cqi, 2.2rem); font-weight: 600; color: var(--ion-color-primary); }
    .subtitle { margin: 0; font-size: clamp(1.25rem, 2.6cqi, 1.6rem); font-weight: 600; color: var(--ion-color-primary); }
    .name { font-size: 1.2rem; color: var(--ion-text-color); }
    .lines { font-size: 1.1rem; line-height: 1.6; color: var(--ion-color-step-700, var(--ion-text-color)); }
    a.link { color: var(--ion-color-primary); text-decoration: underline; overflow-wrap: anywhere; font-size: 1.1rem; }
    .logo { max-width: 200px; max-height: 120px; object-fit: contain; align-self: flex-start; }
    .avatar { width: 100%; max-width: 280px; aspect-ratio: 1; object-fit: cover; border-radius: 6px; }

    .map { position: relative; width: 100%; aspect-ratio: 4 / 5; min-height: 280px; max-height: 560px; border-radius: 6px; overflow: hidden;
           background: var(--ion-color-light); }
    @container (width < 640px) { .map { aspect-ratio: 4 / 3; } }
    .map iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    .map-open { font-size: 0.9rem; }

    .form { border-radius: 6px; background: var(--ion-color-light); padding: 8px; }
    .form ion-button { margin: 8px 16px 12px; }
    .form ion-note { display: block; margin: 0 16px 12px; }
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <!-- title and subtitle are layout blocks; only the intro stays in the header -->
        <okr-optional-card-header [intro]="section.intro" [introPosition]="section.introPosition" title="" subTitle="" />
        <ion-card-content>
          <div class="contact" role="region" [attr.aria-label]="section.title || i18n().contact_region()">
            @for(row of rows(); track $index) {
              <div class="row" [style.grid-template-columns]="row.template">
                @for(col of row.columns; track $index) {
                  <div class="col">
                    @for(element of col; track element) {
                      @switch(element) {
                        @case('title') { <h2 class="title">{{ section.title }}</h2> }
                        @case('subTitle') { <h3 class="subtitle">{{ section.subTitle }}</h3> }
                        @case('orgLogo') { <img class="logo" [src]="details().org?.imageUrl" [alt]="details().org?.name ?? ''" /> }
                        @case('orgName') { <div class="name">{{ details().org?.name }}</div> }
                        @case('orgAddress') {
                          <div class="lines">@for(line of details().org?.addressLines ?? []; track $index) { <div>{{ line }}</div> }</div>
                        }
                        @case('orgEmail') { <a class="link" [href]="'mailto:' + details().org?.email">{{ details().org?.email }}</a> }
                        @case('orgPhone') { <a class="link" [href]="tel(details().org?.phone)">{{ details().org?.phone }}</a> }
                        @case('personAvatar') { <img class="avatar" [src]="details().person?.imageUrl" [alt]="details().person?.name ?? ''" /> }
                        @case('personName') { <div class="name">{{ details().person?.name }}</div> }
                        @case('personAddress') {
                          <div class="lines">@for(line of details().person?.addressLines ?? []; track $index) { <div>{{ line }}</div> }</div>
                        }
                        @case('personEmail') { <a class="link" [href]="'mailto:' + details().person?.email">{{ details().person?.email }}</a> }
                        @case('personPhone') { <a class="link" [href]="tel(details().person?.phone)">{{ details().person?.phone }}</a> }
                        @case('map') {
                          @if(mapUrl(); as url) {
                            <div class="map">
                              <iframe [src]="url" [title]="i18n().contact_element_map()" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
                            </div>
                            <a class="link map-open" [href]="mapOpenUrl()" target="_blank" rel="noopener">{{ i18n().contact_map_open() }}</a>
                          }
                        }
                        @case('form') {
                          <div class="form">
                            <okr-contact-message-form [formData]="message()" (formDataChange)="message.set($event)"
                              [fields]="config().formFields" [i18n]="i18n()" (valid)="messageValid.set($event)" />
                            @if(recipient()) {
                              <ion-button [disabled]="!messageValid()" (click)="send()">
                                <ion-icon slot="start" src="{{ 'send' | svgIcon }}" />{{ i18n().contact_form_send() }}
                              </ion-button>
                              @if(sent()) { <ion-note color="success">{{ i18n().contact_form_sent() }}</ion-note> }
                            } @else {
                              <ion-note color="medium">{{ i18n().contact_form_noRecipient() }}</ion-note>
                            }
                          </div>
                        }
                      }
                    }
                  </div>
                }
              </div>
            }
          </div>
        </ion-card-content>
      </ion-card>
    }
  `
})
export class ContactSectionComponent {
  protected readonly store = inject(SectionStore);
  private readonly contactDetailsService = inject(ContactDetailsService);
  private readonly sanitizer = inject(DomSanitizer);

  public section = input<ContactSection>();

  protected readonly i18n = computed<SectionI18n>(() => this.store.i18n);
  protected readonly config = computed(() => normalizeContactConfig(this.section()?.properties));
  protected readonly details = computed(() => this.contactDetailsService.resolve(this.config().orgKey, this.config().personKey));

  /** the stored rows reduced to what shows: hidden elements and then empty columns and rows drop out */
  protected readonly rows = computed(() => {
    const config = this.config();
    const details = this.details();
    const section = this.section();
    const visible = (e: ContactElement) => isContactElementVisible(e, config, details, section?.title, section?.subTitle);
    return config.rows
      .map(r => r.columns.map(c => ({ width: c.width, elements: c.elements.filter(visible) })).filter(c => c.elements.length > 0))
      .filter(cols => cols.length > 0)
      .map(cols => ({ template: cols.map(c => `${c.width}fr`).join(' '), columns: cols.map(c => c.elements) }));
  });

  private readonly orgAddress = computed(() => this.details().org?.addressLines ?? []);
  protected readonly mapUrl = computed<SafeResourceUrl | undefined>(() => {
    // built here from encodeURIComponent'ed text and a fixed Google origin (allowed by the frame-src CSP)
    const url = getContactMapEmbedUrl(this.orgAddress());
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : undefined;
  });
  protected readonly mapOpenUrl = computed(() =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(this.orgAddress().join(', '))}`);

  // the contact form — never stored
  protected readonly message = signal<ContactFormModel>({ ...CONTACT_FORM_MODEL_SHAPE });
  protected readonly messageValid = signal(false);
  protected readonly sent = signal(false);
  protected readonly recipient = computed(() => this.details().person?.email || this.details().org?.email || '');

  protected tel(phone: string | undefined): string {
    return phone ? getTelLink(phone) : '';
  }

  protected send(): void {
    if (!this.messageValid() || !this.recipient()) return;
    const i = this.i18n();
    const labels: Record<string, string> = {
      firstName: i.contact_field_firstName(), lastName: i.contact_field_lastName(),
      email: i.contact_field_email(), phone: i.contact_field_phone(),
    };
    const visible = new Set(this.config().formFields.filter(f => f.isVisible).map(f => f.name));
    const values = Object.fromEntries(Object.entries(this.message()).filter(([k]) => visible.has(k as keyof ContactFormModel)));
    const subject = [i.contact_form_subject(), this.section()?.title].filter(Boolean).join(' – ');
    window.location.href = getContactMailtoLink(this.recipient(), subject, values, labels);
    this.sent.set(true);
  }
}
