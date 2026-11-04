/**
 * Keys live here (util), the translations live in the lib that renders them
 * (`libs/geo/energy/feature/src/i18n/*.json`), so the prefix must mirror THAT path:
 * a mismatch 404s at runtime and no build notices.
 */
const PFX = '@geo/energy/feature.';

/**
 * Keys with a `{param}` placeholder (single braces, filled by the caller: `translateAll`
 * strips `{{param}}`): `state_stale` {date}, `header_bfsNr` {n}, `header_asOf` {date},
 * `tiles_households` {share}, `tiles_tariffFallback` {year}, `tiles_periodUntil` {date},
 * `tiles_asOf` {date}, `tariffs_operator` {name}.
 */
export const ENERGY_I18N_KEYS = {
  state_noLocation:             PFX + 'state.noLocation',
  state_preparing:              PFX + 'state.preparing',
  state_noData:                 PFX + 'state.noData',
  state_noBlock:                PFX + 'state.noBlock',
  state_stale:                  PFX + 'state.stale',

  header_bfsNr:                 PFX + 'header.bfsNr',
  header_asOf:                  PFX + 'header.asOf',
  header_operators:             PFX + 'header.operators',

  tiles_title:                  PFX + 'tiles.title',
  tiles_consumption:            PFX + 'tiles.consumption',
  tiles_households:             PFX + 'tiles.households',
  tiles_production:             PFX + 'tiles.production',
  tiles_solarCapacity:          PFX + 'tiles.solarCapacity',
  tiles_solarPotential:         PFX + 'tiles.solarPotential',
  tiles_renewableHeating:       PFX + 'tiles.renewableHeating',
  tiles_electricCars:           PFX + 'tiles.electricCars',
  tiles_chargingPoints:         PFX + 'tiles.chargingPoints',
  tiles_tariff:                 PFX + 'tiles.tariff',
  tiles_tariffFallback:         PFX + 'tiles.tariffFallback',
  tiles_periodUntil:            PFX + 'tiles.periodUntil',
  tiles_asOf:                   PFX + 'tiles.asOf',
  tiles_unitMwh:                PFX + 'tiles.unitMwh',
  tiles_unitKwp:                PFX + 'tiles.unitKwp',
  tiles_unitRpKwh:              PFX + 'tiles.unitRpKwh',

  trends_title:                 PFX + 'trends.title',
  trends_solarCapacity:         PFX + 'trends.solarCapacity',
  trends_electricCars:          PFX + 'trends.electricCars',
  trends_renewableHeating:      PFX + 'trends.renewableHeating',
  trends_electricity:           PFX + 'trends.electricity',
  trends_consumption:           PFX + 'trends.consumption',
  trends_production:            PFX + 'trends.production',
  trends_gapsNote:              PFX + 'trends.gapsNote',

  tariffs_title:                PFX + 'tariffs.title',
  tariffs_operator:             PFX + 'tariffs.operator',
  tariffs_energy:               PFX + 'tariffs.energy',
  tariffs_gridUsage:            PFX + 'tariffs.gridUsage',
  tariffs_charge:               PFX + 'tariffs.charge',
  tariffs_aidFee:               PFX + 'tariffs.aidFee',
  tariffs_future:               PFX + 'tariffs.future',
  tariffs_futureNote:           PFX + 'tariffs.futureNote',
  tariffs_unit:                 PFX + 'tariffs.unit',

  compare_title:                PFX + 'compare.title',
  compare_municipality:         PFX + 'compare.municipality',
  compare_solarPotential:       PFX + 'compare.solarPotential',
  compare_renewableHeating:     PFX + 'compare.renewableHeating',
  compare_electricCars:         PFX + 'compare.electricCars',
  compare_electricityPerPerson: PFX + 'compare.electricityPerPerson',
  compare_tariff:               PFX + 'compare.tariff',
  compare_noData:               PFX + 'compare.noData',
  compare_note:                 PFX + 'compare.note',

  gaps_title:                   PFX + 'gaps.title',
  gaps_intro:                   PFX + 'gaps.intro',
  gaps_gasHeat:                 PFX + 'gaps.gasHeat',
  gaps_storage:                 PFX + 'gaps.storage',
  gaps_heatingAge:              PFX + 'gaps.heatingAge',
  gaps_outages:                 PFX + 'gaps.outages',

  sources_title:                PFX + 'sources.title',
  sources_energyReporter:       PFX + 'sources.energyReporter',
  sources_energyReporterLink:   PFX + 'sources.energyReporterLink',
  sources_tariffs:              PFX + 'sources.tariffs',
  sources_solar:                PFX + 'sources.solar',
  sources_solarLink:            PFX + 'sources.solarLink',
} as const;

export type EnergyI18nKey = keyof typeof ENERGY_I18N_KEYS;

/** The resolved texts: `translateAll` gives signals, and a plain getter is all the util needs from them. */
export type EnergyI18n = Record<EnergyI18nKey, () => string>;
