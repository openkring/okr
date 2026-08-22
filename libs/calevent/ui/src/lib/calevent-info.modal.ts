import { Component, computed, inject, input } from '@angular/core';
import { IonContent, IonIcon, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Header } from '@okr/shared-ui';
import { getAttendanceColor, getAttendanceIcon } from '@okr/shared-util-core';

import { CALEVENT_I18N_KEYS, CaleventI18n } from '@okr/calevent-util';

/**
 * Explains calendars and invitations to the user: which view shows which events, the four
 * kinds of calendar and what each one can do, and how accepting/declining an invitation
 * works — triggered by the info icon in the calevent list, the invitation list and the two
 * dashboard widgets ('Nächste Termine', 'Meine Einladungen').
 *
 * The content is tabular on purpose: the four calendar types differ along the same three
 * axes (who sees it, who may create it, what it can do), and a table is the only layout
 * that lets the reader compare them. On phones the tables collapse to stacked rows with the
 * column header repeated as a label — a four-column grid at 360px is unreadable.
 *
 * Lives in `ui` and injects `I18nService` directly (no store), so any feature lib can open
 * it without a circular import back into `CalEventStore`.
 */
@Component({
  selector: 'okr-calevent-info-modal',
  standalone: true,
  imports: [
    Header, SvgIconPipe,
    IonContent, IonIcon,
  ],
  styles: [`
    .sheet {
      max-width: 760px;
      margin: 0 auto;
      padding: 24px 24px 32px;
    }
    .intro {
      margin: 0 0 26px;
      font-size: 16px;
      line-height: 1.5;
    }
    .block { margin-bottom: 28px; }
    .eyebrow {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--ion-color-medium);
      margin-bottom: 6px;
    }
    .block > p { margin: 0 0 12px; font-size: 15px; line-height: 1.5; }

    .table-wrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      line-height: 1.45;
    }
    th, td {
      text-align: start;
      vertical-align: top;
      padding: 10px 12px 10px 0;
      border-bottom: 1px solid var(--ion-color-light-shade);
    }
    th {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: var(--ion-color-medium);
      white-space: nowrap;
    }
    td.label { font-weight: 600; white-space: nowrap; }
    .sub { display: block; font-weight: 400; font-size: 13px; color: var(--ion-color-medium); }
    .symbol { width: 48px; }
    .symbol ion-icon { font-size: 26px; }

    /* two-column definition list for the open/closed attendance model */
    .defs { display: grid; gap: 10px; margin: 0 0 12px; }
    .defs div { font-size: 15px; line-height: 1.5; }
    .defs strong { display: block; }

    .note {
      margin-top: 8px;
      padding: 16px 18px;
      background: var(--ion-color-light);
      border-radius: 8px;
    }
    .note p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ion-color-medium-shade); }

    /* the phone gets stacked rows: a 4-column comparison table at 360px is unreadable */
    @media (width <= 640px) {
      .sheet { padding-inline: 16px; }
      table.stack thead { display: none; }
      table.stack tr {
        display: block;
        padding: 12px 0;
        border-bottom: 1px solid var(--ion-color-light-shade);
      }
      table.stack td { display: block; border: 0; padding: 0 0 6px; }
      table.stack td:last-child { padding-bottom: 0; }
      table.stack td.label { white-space: normal; font-size: 15px; padding-bottom: 8px; }
      table.stack td[data-label]:not(.label)::before {
        content: attr(data-label);
        display: block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .06em;
        text-transform: uppercase;
        color: var(--ion-color-medium);
      }
    }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.info_title() }" [isModal]="true" />
    <ion-content>
      <div class="sheet">
        <p class="intro">{{ i18n.info_intro() }}</p>

        <!-- 1) which view shows which events -->
        <div class="block">
          <div class="eyebrow">{{ i18n.info_views_title() }}</div>
          <p>{{ i18n.info_views_text() }}</p>
          <div class="table-wrap">
            <table class="stack">
              <thead>
                <tr>
                  <th>{{ i18n.info_views_col_view() }}</th>
                  <th>{{ i18n.info_views_col_shows() }}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="label">{{ i18n.info_views_dashboard() }}</td>
                  <td [attr.data-label]="i18n.info_views_col_shows()">{{ i18n.info_views_dashboard_text() }}</td>
                </tr>
                <tr>
                  <td class="label">{{ i18n.info_views_invitations() }}</td>
                  <td [attr.data-label]="i18n.info_views_col_shows()">{{ i18n.info_views_invitations_text() }}</td>
                </tr>
                <tr>
                  <td class="label">{{ i18n.info_views_personal() }}</td>
                  <td [attr.data-label]="i18n.info_views_col_shows()">{{ i18n.info_views_personal_text() }}</td>
                </tr>
                <tr>
                  <td class="label">{{ i18n.info_views_group() }}</td>
                  <td [attr.data-label]="i18n.info_views_col_shows()">{{ i18n.info_views_group_text() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 2) the four calendar types, compared along the same three axes -->
        <div class="block">
          <div class="eyebrow">{{ i18n.info_types_title() }}</div>
          <p>{{ i18n.info_types_text() }}</p>
          <div class="table-wrap">
            <table class="stack">
              <thead>
                <tr>
                  <th>{{ i18n.info_types_col_calendar() }}</th>
                  <th>{{ i18n.info_types_col_visibility() }}</th>
                  <th>{{ i18n.info_types_col_create() }}</th>
                  <th>{{ i18n.info_types_col_features() }}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="label">{{ i18n.info_types_personal() }}</td>
                  <td [attr.data-label]="i18n.info_types_col_visibility()">{{ i18n.info_types_personal_visibility() }}</td>
                  <td [attr.data-label]="i18n.info_types_col_create()">{{ i18n.info_types_personal_create() }}</td>
                  <td [attr.data-label]="i18n.info_types_col_features()">{{ i18n.info_types_personal_features() }}</td>
                </tr>
                <tr>
                  <td class="label">{{ i18n.info_types_group() }}</td>
                  <td [attr.data-label]="i18n.info_types_col_visibility()">{{ i18n.info_types_group_visibility() }}</td>
                  <td [attr.data-label]="i18n.info_types_col_create()">{{ i18n.info_types_group_create() }}</td>
                  <td [attr.data-label]="i18n.info_types_col_features()">{{ i18n.info_types_group_features() }}</td>
                </tr>
                <tr>
                  <td class="label">
                    {{ orgCalendarLabel() }}
                    @if (tenantName()) {
                      <span class="sub">{{ i18n.info_types_org() }}</span>
                    }
                  </td>
                  <td [attr.data-label]="i18n.info_types_col_visibility()">{{ i18n.info_types_org_visibility() }}</td>
                  <td [attr.data-label]="i18n.info_types_col_create()">{{ i18n.info_types_org_create() }}</td>
                  <td [attr.data-label]="i18n.info_types_col_features()">{{ i18n.info_types_org_features() }}</td>
                </tr>
                <tr>
                  <td class="label">{{ i18n.info_types_public() }}</td>
                  <td [attr.data-label]="i18n.info_types_col_visibility()">{{ i18n.info_types_public_visibility() }}</td>
                  <td [attr.data-label]="i18n.info_types_col_create()">{{ i18n.info_types_public_create() }}</td>
                  <td [attr.data-label]="i18n.info_types_col_features()">{{ i18n.info_types_public_features() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 3) invitations: open vs closed, how to answer, what the symbols mean -->
        <div class="block">
          <div class="eyebrow">{{ i18n.info_invitations_title() }}</div>
          <p>{{ i18n.info_invitations_text() }}</p>
          <div class="defs">
            <div>
              <strong>{{ i18n.info_invitations_open() }}</strong>
              {{ i18n.info_invitations_open_text() }}
            </div>
            <div>
              <strong>{{ i18n.info_invitations_closed() }}</strong>
              {{ i18n.info_invitations_closed_text() }}
            </div>
          </div>
          <p>{{ i18n.info_invitations_respond() }}</p>
          <p>{{ i18n.info_invitations_series() }}</p>
        </div>

        <div class="block">
          <div class="eyebrow">{{ i18n.info_symbols_title() }}</div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{{ i18n.info_symbols_col_symbol() }}</th>
                  <th>{{ i18n.info_symbols_col_meaning() }}</th>
                </tr>
              </thead>
              <tbody>
                @for (symbol of symbols; track symbol.state) {
                  <tr>
                    <td class="symbol">
                      <ion-icon src="{{ getAttendanceIcon(symbol.state) | svgIcon }}" color="{{ getAttendanceColor(symbol.state) || 'medium' }}" />
                    </td>
                    <td>{{ i18n[symbol.key]() }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="note">
          <p>{{ i18n.info_note() }}</p>
        </div>
      </div>
    </ion-content>
  `,
})
export class CalEventInfoModal {
  protected readonly i18n = inject(I18nService).translateAll(CALEVENT_I18N_KEYS) as CaleventI18n;

  /** Display name of the tenant, used to name the organisation calendar (e.g. 'Seeclub Stäfa'). */
  public readonly tenantName = input<string>('');

  protected readonly orgCalendarLabel = computed(() => this.tenantName() || this.i18n.info_types_org());

  /** The three attendance states, in the order a reader meets them: yes, no, not answered yet. */
  protected readonly symbols = [
    { state: 'accepted', key: 'info_symbols_accepted' },
    { state: 'declined', key: 'info_symbols_declined' },
    { state: 'invited', key: 'info_symbols_open' },
  ] as const;

  protected getAttendanceIcon = getAttendanceIcon;
  protected getAttendanceColor = getAttendanceColor;
}

/**
 * Opens the calendar/invitation explainer. Exported so every entry point (calevent list,
 * invitation list, dashboard widgets) opens the same modal the same way.
 */
export async function showCalEventInfo(modalController: ModalController, tenantName = ''): Promise<void> {
  const modal = await modalController.create({
    component: CalEventInfoModal,
    componentProps: { tenantName },
  });
  await modal.present();
  await modal.onDidDismiss();
}
