import { Component, input } from '@angular/core';
import { IonContent } from '@ionic/angular';

import type { CategoryListModel, PeopleSection, UserModel } from '@okr/shared-models';
import { Header } from '@okr/shared-ui';

/**
 * The people block editor (spec 1.181): the window of the editor surface. Task 8 fills the body; today it is the header and an empty content.
 *
 * Open it with `openPeopleEditor` only: it is in no chunk that readers load and not exported from the lib.
 */
@Component({
  selector: 'okr-people-editor-modal',
  standalone: true,
  imports: [Header, IonContent],
  template: `
    <okr-header [i18n]="{ title: '' }" [isModal]="true" />
    <ion-content />
  `,
})
export class PeopleEditorModal {
  public readonly section = input.required<PeopleSection>();
  public readonly isNew = input.required<boolean>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly tagModel = input.required<string>();
  /** Tells the key of each successful save. */
  public readonly onSaved = input.required<(key: string) => void>();
}
