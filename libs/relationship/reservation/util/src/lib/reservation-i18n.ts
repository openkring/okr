import { Signal } from '@angular/core';

const PFX = '@relationship/reservation/feature.';

export const RESERVATION_I18N_KEYS = {
  reservation:                    PFX + 'reservation',
  reservations:                   PFX + 'reservations',
  description:                    PFX + 'desc',
  empty:                          PFX + 'empty',
  reldesc1:                       PFX + 'reldesc1',
  reldesc2:                       PFX + 'reldesc2',
  newDesc:                        PFX + 'newDesc',

  create:                         PFX + 'create.label',
  create_conf:                    PFX + 'create.conf',
  create_error:                   PFX + 'create.error',

  delete:                         PFX + 'delete.label',
  delete_confirm:                 PFX + 'delete.confirm',
  delete_conf:                    PFX + 'delete.conf',
  delete_error:                   PFX + 'delete.error',

  end:                            PFX + 'end.label',
  end_conf:                       PFX + 'end.conf',
  end_error:                      PFX + 'end.error',

  select:                         PFX + 'select.label',

  update:                         PFX + 'update.label',
  update_conf:                    PFX + 'update.conf',
  update_error:                   PFX + 'update.error',

  view:                           PFX + 'view.label',

  person_edit:                    PFX + 'person.edit',
  person_view:                    PFX + 'person.view',
  person_phone:                   PFX + 'person.phone',
  person_chat:                    PFX + 'person.chat',

  list_title:                     PFX + 'list.title',
  list_header_reserver:           PFX + 'list.header.reserver',
  list_header_name:               PFX + 'list.header.name',
  list_header_state:              PFX + 'list.header.state',
  list_header_resource:           PFX + 'list.header.resource',
  list_header_date:               PFX + 'list.header.date',
  list_header_duration:           PFX + 'list.header.duration',
  list_header_category:           PFX + 'list.header.category',

  bkey_label:                     PFX + 'bkey.label',
  bkey_placeholder:               PFX + 'bkey.placeholder',
  bkey_helper:                    PFX + 'bkey.helper',

  name_label:                     PFX + 'name.label',
  name_placeholder:               PFX + 'name.placeholder',
  name_helper:                    PFX + 'name.helper',

  notes_label:                    PFX + 'notes.label',
  notes_placeholder:              PFX + 'notes.placeholder',

  reserver_label:                 PFX + 'reserver.label',
  reserver_helper:                PFX + 'reserver.helper',

  resource_label:                 PFX + 'resource.label',
  resource_placeholder:           PFX + 'resource.placeholder',
  resource_helper:                PFX + 'resource.helper',

  startDate_label:                PFX + 'date.start.label',
  startDate_placeholder:          PFX + 'date.start.placeholder',
  startDate_helper:               PFX + 'date.start.helper',

  endDate_label:                  PFX + 'date.end.label',
  endDate_placeholder:            PFX + 'date.end.placeholder',
  endDate_helper:                 PFX + 'date.end.helper',

  startTime_label:                PFX + 'startTime.label',
  startTime_placeholder:          PFX + 'startTime.placeholder',

  fullDay_label:                  PFX + 'fullDay.label',
  fullDay_helper:                 PFX + 'fullDay.helper',

  durationMinutes_label:          PFX + 'durationMinutes.label',
  durationMinutes_placeholder:    PFX + 'durationMinutes.placeholder',
  durationMinutes_helper:         PFX + 'durationMinutes.helper',

  participants_label:             PFX + 'participants.label',
  participants_placeholder:       PFX + 'participants.placeholder',
  participants_helper:            PFX + 'participants.helper',

  area_label:                     PFX + 'area.label',
  area_placeholder:               PFX + 'area.placeholder',
  area_helper:                    PFX + 'area.helper',

  ref_label:                      PFX + 'ref.label',
  ref_placeholder:                PFX + 'ref.placeholder',
  ref_helper:                     PFX + 'ref.helper',

  order_label:                    PFX + 'order.label',
  order_placeholder:              PFX + 'order.placeholder',
  order_helper:                   PFX + 'order.helper',

  description_label:              PFX + 'description.label',
  description_placeholder:        PFX + 'description.placeholder',

  price_label:                    PFX + 'price.label',
  price_placeholder:              PFX + 'price.placeholder',
  price_helper:                   PFX + 'price.helper',

  confirmed_label:                PFX + 'confirmed.label',
  confirmed_helper:               PFX + 'confirmed.helper',

  // reservation_reason: explicit
  // reservation_state: explicit
  state:                          PFX + 'reservation_state.label',
  
  as_title:                        '@actionsheet.title',
  ok:                              '@ok',
  cancel:                          '@cancel',
  save:                            '@save.label',

} satisfies Record<string, string>;

export type ReservationI18n = { [K in keyof typeof RESERVATION_I18N_KEYS]: Signal<string> };
