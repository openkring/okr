import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, ModalController } from '@ionic/angular';

import { COURSE_HELP_SECTIONS, COURSE_I18N_KEYS, COURSE_PROCESS_INVITE, COURSE_PROCESS_STEPS, CourseHelpRole, CourseI18n } from '@okr/calendar-course-util';
import { I18nService } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';

/**
 * The (i) help of the course screens (spec 1.132 §10, D8): what the viewer can do with a course, written for the
 * viewer's role — trainer, responsible person, treasurer or participant. One card per task, in reading order.
 *
 * Lives in `ui` and injects `I18nService` directly (no store), so the course list, the course table and the task
 * view can open it without importing a store of the course feature.
 */
@Component({
  selector: 'okr-course-help-modal',
  standalone: true,
  imports: [Header, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .role {
      margin: 0 0 4px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--ion-color-medium);
    }
    .intro { margin: 0 0 8px; font-size: 15px; line-height: 1.5; }
    /* the texts separate paragraphs with a line break */
    ion-card-content { white-space: pre-line; font-size: 14px; line-height: 1.5; }
    ion-card-title { font-size: 17px; }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.help_title() }" [isModal]="true" />
    <ion-content class="ion-padding">
      @if (withProcess()) {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n.help_process_title() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>{{ processSteps() }}</ion-card-content>
        </ion-card>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ processInvite().title }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>{{ processInvite().text }}</ion-card-content>
        </ion-card>
      }
      <p class="role">{{ roleLabel() }}</p>
      <p class="intro">{{ intro() }}</p>
      @for (section of sections(); track section.title) {
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ section.title }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>{{ section.text }}</ion-card-content>
        </ion-card>
      }
    </ion-content>
  `,
})
export class CourseHelpModal {
  // direct inject, no store: any lib opens this modal
  protected readonly i18n = inject(I18nService).translateAll(COURSE_I18N_KEYS) as CourseI18n;

  // inputs
  public readonly role = input.required<CourseHelpRole>();
  /** the course list shows the Anmeldeprozess first; the course table does not */
  public readonly withProcess = input(false);

  protected readonly roleLabel = computed(() => this.i18n[`help_${this.role()}_role`]());
  protected readonly intro = computed(() => this.i18n[`help_${this.role()}_intro`]());
  protected readonly processSteps = computed(() =>
    COURSE_PROCESS_STEPS.map((step, i) => `${i + 1}. ${this.i18n[step]()}`).join('\n'));
  protected readonly processInvite = computed(() => ({
    title: this.i18n[COURSE_PROCESS_INVITE.title](), text: this.i18n[COURSE_PROCESS_INVITE.text](),
  }));
  protected readonly sections = computed(() =>
    COURSE_HELP_SECTIONS[this.role()].map(section => ({ title: this.i18n[section.title](), text: this.i18n[section.text]() })));
}

/**
 * Opens the course help for a role. Exported so every entry point (course list, course table, the treasurer's task)
 * opens the same modal the same way.
 */
export async function openCourseHelp(modalController: ModalController, role: CourseHelpRole, options: { withProcess?: boolean } = {}): Promise<void> {
  const modal = await modalController.create({
    component: CourseHelpModal,
    componentProps: { role, withProcess: options.withProcess ?? false },
  });
  await modal.present();
  await modal.onDidDismiss();
}
