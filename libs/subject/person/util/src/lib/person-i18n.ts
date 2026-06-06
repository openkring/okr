import { Signal } from '@angular/core';

const PFX = '@subject/person/feature.';

export const PERSON_I18N_KEYS = {
    persons:                    PFX + 'persons',
    empty:                      PFX + 'empty',
    details:                    PFX + 'details',
    addresses:                  PFX + 'addresses',
    misc:                       PFX + 'misc',

    // person form field keys (from @subject/person/ui)
    bkey_label:                 PFX + 'bkey.label',
    bkey_placeholder:           PFX + 'bkey.placeholder',
    bkey_helper:                PFX + 'bkey.helper',

    firstName_label:            PFX + 'firstName.label',
    firstName_placeholder:      PFX + 'firstName.placeholder',
    firstName_helper:           PFX + 'firstName.helper',

    lastName_label:             PFX + 'lastName.label',
    lastName_placeholder:       PFX + 'lastName.placeholder',
    lastName_helper:            PFX + 'lastName.helper',

    ssnId_label:                PFX + 'ssnId.label',
    ssnId_placeholder:          PFX + 'ssnId.placeholder',
    ssnId_helper:               PFX + 'ssnId.helper',

    bexioId_label:              PFX + 'bexioId.label',
    bexioId_placeholder:        PFX + 'bexioId.placeholder',
    bexioId_helper:             PFX + 'bexioId.helper',

    email_label:                PFX + 'email.label',
    email_placeholder:          PFX + 'email.placeholder',

    phone_label:                PFX + 'phone.label',
    phone_placeholder:          PFX + 'phone.placeholder',

    notes_label:                PFX + 'notes.label',
    notes_placeholder:          PFX + 'notes.placeholder',

    dateOfBirth_label:          PFX + 'dateOfBirth.label',
    dateOfBirth_placeholder:    PFX + 'dateOfBirth.placeholder',
    dateOfBirth_helper:         PFX + 'dateOfBirth.helper',

    dateOfDeath_label:          PFX + 'dateOfDeath.label',
    dateOfDeath_placeholder:    PFX + 'dateOfDeath.placeholder',
    dateOfDeath_helper:         PFX + 'dateOfDeath.helper',

    dateOfEntry_label:          PFX + 'dateOfEntry.label',
    dateOfEntry_placeholder:    PFX + 'dateOfEntry.placeholder',
    dateOfEntry_helper:         PFX + 'dateOfEntry.helper',

    streetName_label:           PFX + 'streetName.label',
    streetName_placeholder:     PFX + 'streetName.placeholder',
    streetName_helper:          PFX + 'streetName.helper',

    streetNumber_label:         PFX + 'streetNumber.label',
    streetNumber_placeholder:   PFX + 'streetNumber.placeholder',
    streetNumber_helper:        PFX + 'streetNumber.helper',

    countryCode_label:          PFX + 'countryCode.label',
    countryCode_placeholder:    PFX + 'countryCode.placeholder',
    countryCode_helper:         PFX + 'countryCode.helper',

    zipCode_label:              PFX + 'zipCode.label',
    zipCode_placeholder:        PFX + 'zipCode.placeholder',
    zipCode_helper:             PFX + 'zipCode.helper',

    city_label:                 PFX + 'city.label',
    city_placeholder:           PFX + 'city.placeholder',
    city_helper:                PFX + 'city.helper',

    web_label:                  PFX + 'web.label',
    web_placeholder:            PFX + 'web.placeholder',
    web_helper:                 PFX + 'web.helper',

    add_membership_label:       PFX + 'add.membership.label',
    add_membership_confirm:     PFX + 'add.membership.confirm',
    add_membership_conf:        PFX + 'add.membership.conf',
    add_membership_error:       PFX + 'add.membership.error',
    add_membership_helper:      PFX + 'add.membership.helper',
    add_membership_exists:      PFX + 'add.membership.exists',

    call_phone:                 PFX + 'call.phone',
    copy_email:                 PFX + 'copy.email.label',
    copy_email_conf:            PFX + 'copy.email.conf',
    copy_email_error:           PFX + 'copy.email.error',
    copy_phone:                 PFX + 'copy.phone.label',
    copy_phone_conf:            PFX + 'copy.phone.conf',
    copy_phone_error:           PFX + 'copy.phone.error',
    create:                     PFX + 'create.label',
    create_conf:                PFX + 'create.conf',
    create_error:               PFX + 'create.error',
    update:                     PFX + 'update.label',
    update_conf:                PFX + 'update.conf',
    update_error:               PFX + 'update.error',
    send_message:               PFX + 'send.message',
    send_email:                 PFX + 'send.email',
    show_postal:                PFX + 'show.postal',
    view:                       PFX + 'view.label',
    delete:                     PFX + 'delete.label',
    delete_conf:                PFX + 'delete.conf',
    delete_confirm:             PFX + 'delete.confirm',
    delete_error:               PFX + 'delete.error',

    // gender (resolved in cat-select)
    gender_label:               PFX + 'gender.label',
    gender_helper:              PFX + 'gender.helper',

    validation_lastNameRequired: PFX + 'validation.lastNameRequired',
    validation_validSSN:        PFX + 'validation.validSSN',

    as_title:                   '@actionsheet.title',
    name:                       '@name.label',
    select:                     '@select.label',
    ok:                         '@ok',
    cancel:                     '@cancel',
    save:                       '@save.label',


} satisfies Record<string, string>;

export type PersonI18n = { [K in keyof typeof PERSON_I18N_KEYS]: Signal<string> };
