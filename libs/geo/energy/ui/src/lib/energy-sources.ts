import { Component, input } from '@angular/core';

import { ENERGY_REPORTER_URL } from '@okr/energy-util';

/** Texts of the sources block, already translated. */
export type EnergySourcesI18n = {
  title: string;
  energyReporter: string;
  energyReporterLink: string;
  tariffs: string;
  solar: string;
  solarLink: string;
};

/**
 * Attribution the CC BY 4.0 licence of Energie Reporter requires: the name, its contributors
 * (geoimpact, EnergieSchweiz, named in the text) and a link to the site. Also names ElCom (tariffs)
 * and BFE (solar document). The solar link shows only when the municipality's address is given.
 */
@Component({
  selector: 'okr-energy-sources',
  imports: [],
  styles: [`
    .sources { color: var(--ion-text-color); font-size: 0.875rem; }
    h3 { margin: 0 0 0.5rem; font-size: 1rem; }
    p { margin: 0 0 0.5rem; }
    a { color: var(--ion-color-primary); }
  `],
  template: `
    <section class="sources">
      <h3>{{ i18n().title }}</h3>
      <p>
        {{ i18n().energyReporter }}
        <a [href]="energyReporterUrl" target="_blank" rel="noopener">{{ i18n().energyReporterLink }}</a>
      </p>
      <p>{{ i18n().tariffs }}</p>
      <p>
        {{ i18n().solar }}
        @if (solarUrl(); as url) {
          <a [href]="url" target="_blank" rel="noopener">{{ i18n().solarLink }}</a>
        }
      </p>
    </section>
  `
})
export class EnergySources {
  // inputs
  public i18n = input.required<EnergySourcesI18n>();
  /** The BFE solar document of the municipality (`solarDocumentUrl(bfsNr)`); no link without it. */
  public solarUrl = input<string | undefined>(undefined);

  protected readonly energyReporterUrl = ENERGY_REPORTER_URL;
}
