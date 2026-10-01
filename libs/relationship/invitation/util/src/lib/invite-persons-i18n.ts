import { Signal } from '@angular/core';

/**
 * Die Beschriftungen des Einladungs-Modals. Aufgeloest wird sie vom CalEventStore aus
 * CALEVENT_I18N_KEYS — das Modal wird von dort geoeffnet, und die Schluessel liegen im
 * calevent-Bundle, wo die uebrigen Einladungstexte schon stehen.
 */
export type InvitePersonsI18n = {
  invite_persons_title: Signal<string>;
  /** replaces the title on small screens */
  invite_persons_short_title: Signal<string>;
  /** the one select button of the invitee card */
  invite_persons_select: Signal<string>;
  /** the save button of the change confirmation — an invitation is sent, not saved */
  invite_persons_send: Signal<string>;
  invite_message_label: Signal<string>;
  invite_message_placeholder: Signal<string>;
  invite_message_helper: Signal<string>;
  cancel: Signal<string>;
};
