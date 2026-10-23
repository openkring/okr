import type { AlertOptions } from '@ionic/angular';

import { LearningI18n } from '@okr/content-learning-util';

/**
 * Confirmation before a learning room goes public (spec 1.115 §5.5). Not a modal: the caller
 * passes these options to `AlertController.create()` and publishes only on role 'confirm'.
 * The message names the consequences: everything in the room becomes visible to anyone on the
 * internet (including people shown in videos, often minors) and stays cached for a while after
 * unpublishing.
 */
export function learningPublishAlertOptions(i18n: LearningI18n): AlertOptions {
  return {
    header: i18n.publish_header(),
    message: i18n.publish_message(),
    buttons: [
      { text: i18n.publish_cancel(), role: 'cancel' },
      { text: i18n.publish_confirm(), role: 'confirm' },
    ],
  };
}

/** Confirmation before a published learning room goes back to members only (spec 1.115 §5.5). */
export function learningUnpublishAlertOptions(i18n: LearningI18n): AlertOptions {
  return {
    header: i18n.unpublish_header(),
    message: i18n.unpublish_message(),
    buttons: [
      { text: i18n.publish_cancel(), role: 'cancel' },
      { text: i18n.unpublish_confirm(), role: 'confirm' },
    ],
  };
}
