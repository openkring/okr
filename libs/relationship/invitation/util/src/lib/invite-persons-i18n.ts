import { Signal } from '@angular/core';

/**
 * Die Beschriftungen des Einladungs-Modals. Aufgeloest wird sie vom CalEventStore aus
 * CALEVENT_I18N_KEYS — das Modal wird von dort geoeffnet, und die Schluessel liegen im
 * calevent-Bundle, wo die uebrigen Einladungstexte schon stehen.
 */
export type InvitePersonsI18n = {
  invite_persons_title: Signal<string>;
  invite_persons_label: Signal<string>;
  invite_persons_add: Signal<string>;
  invite_message_label: Signal<string>;
  invite_message_placeholder: Signal<string>;
  invite_message_helper: Signal<string>;
  cancel: Signal<string>;
  save: Signal<string>;
};
