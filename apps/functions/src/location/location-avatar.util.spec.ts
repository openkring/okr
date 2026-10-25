import { describe, expect, it } from 'vitest';

import {
  buildCatalog, parseGemeindeRegistry, parseLocationText, planLocationAvatar, resolveLocationAvatarPath,
} from './location-avatar.util';

const REGISTRY = [
  'kanton,plz,gemeinde,variante,name_alpenfahnen,datei,quelle_url',
  'zh,8712,Stäfa,altes Wappen,Stäfa (altes Wappen),zh/8712_staefa_zh_altes-wappen.png,https://x',
  'zh,8712,Stäfa,neues Wappen,Stäfa (neues Wappen),zh/8712_staefa_zh.png,https://x',
  'be,2502,Biel/Bienne,,Biel/Bienne,be/2502_biel-bienne_be.png,https://x',
  'ge,1201,Genève,,Genf/Genève,ge/1201_geneve_ge.png,https://x',
  'vd,1530,Payerne,,Payerne,vd/1530_payerne_vd.png,https://x',
  'vd,1530,Payerne,,Payerne,vd/1530_payerne_vd_2.png,https://x',
  'be,3255,Rapperswil,,Rapperswil,be/3255_rapperswil_be.png,https://x',
  'sg,8640,Rapperswil-Jona,,Rapperswil-Jona,sg/8640_rapperswil-jona_sg.png,https://x',
  'bl,4105,Biel-Benken,,Biel-Benken,bl/4105_biel-benken_bl.png,https://x',
  'vd,1804,Corsier-sur-Vevey,,Corsier-sur-Vevey,vd/1804_corsier-sur-vevey_vd.png,https://x',
  'vd,1800,Vevey,,Vevey,vd/1800_vevey_vd.png,https://x',
  'zh,8001,Zürich,,Zürich,zh/8001_zuerich_zh.png,https://x',
  'zh,8132,Egg,,Egg bei Zürich,zh/8132_egg_zh.png,https://x',
  'zh,8107,Buchs,,Buchs,zh/8107_buchs_zh.png,https://x',
  'ag,5033,Buchs,,Buchs,ag/5033_buchs_ag.png,https://x',
  'sg,9470,Buchs,,Buchs,sg/9470_buchs_sg.png,https://x',
  'be,3053,Deisswil bei Münchenbuchsee,,Deisswil bei Münchenbuchsee,be/3053_deisswil_be.png,https://x',
  'be,3053,Münchenbuchsee,,Münchenbuchsee,be/3053_muenchenbuchsee_be.png,https://x',
  'ag,5000,Aarau,,Aarau,ag/5000_aarau_ag.png,https://x',
].join('\n');

const FILES = [
  'general/kantone/zh.svg', 'general/kantone/lu.svg', 'general/kantone/ag.svg', 'general/kantone/sg.svg', 'general/kantone/be.svg',
  'general/deutschland_bundeslaender/bayern.svg', 'general/deutschland_bundeslaender/berlin.svg',
  'general/laender/schweiz.svg', 'general/laender/deutschland.svg', 'general/laender/finnland.svg',
  'general/laender/uk.svg', 'general/laender/oesterreich.svg',
];

const catalog = buildCatalog(parseGemeindeRegistry(REGISTRY), FILES);
const resolve = (name: string, address = '') => resolveLocationAvatarPath({ name, address }, catalog);

describe('parseLocationText', () => {
  it('reads street, PLZ, place and country', () => {
    expect(parseLocationText('Seestrasse 214, 8713 Stäfa, Switzerland'))
      .toEqual({ country: 'schweiz', plz: '8713', city: 'Stäfa' });
  });
  it('reads a trailing canton code', () => {
    expect(parseLocationText('Buchs SG')).toEqual({ city: 'Buchs', canton: 'sg' });
  });
});

describe('resolveLocationAvatarPath — Gemeinde', () => {
  it('PLZ and place agree', () => {
    expect(resolve('Brünishusen', 'Seestrasse 214, 8712 Stäfa, Switzerland')).toBe('general/gemeinden/zh/8712_staefa_zh.png');
  });
  it('unknown PLZ, but the place is unique', () => {
    expect(resolve('Brünishusen', 'Seestrasse 214, 8713 Stäfa, Switzerland')).toBe('general/gemeinden/zh/8712_staefa_zh.png');
  });
  it('a Swiss PLZ without country still counts when the place agrees', () => {
    expect(resolve('Seeclub Stäfa', 'Seestrasse 2b, 8712 Stäfa')).toBe('general/gemeinden/zh/8712_staefa_zh.png');
  });
  it('name only, as bka stores it', () => {
    expect(resolve('Aarau, Switzerland')).toBe('general/gemeinden/ag/5000_aarau_ag.png');
  });
  it('English spelling without umlaut', () => {
    expect(resolve('Zurich, Switzerland')).toBe('general/gemeinden/zh/8001_zuerich_zh.png');
  });
  it('matches the alpenfahnen name too', () => {
    expect(resolve('Egg bei Zürich, Switzerland')).toBe('general/gemeinden/zh/8132_egg_zh.png');
  });
  it('a shared PLZ is told apart by the place', () => {
    expect(resolve('x', '3053 Münchenbuchsee, Switzerland')).toBe('general/gemeinden/be/3053_muenchenbuchsee_be.png');
  });
  it('a canton code tells an ambiguous name apart', () => {
    expect(resolve('Buchs SG')).toBe('general/gemeinden/sg/9470_buchs_sg.png');
  });
  it('the PLZ tells an ambiguous name apart', () => {
    expect(resolve('x', '5033 Buchs, Switzerland')).toBe('general/gemeinden/ag/5033_buchs_ag.png');
  });
  it('a Gemeinde with only variants takes the new coat of arms', () => {
    expect(resolve('Stäfa, Switzerland')).toBe('general/gemeinden/zh/8712_staefa_zh.png');
    expect(resolve('Stäfa, Schiffssteg')).toBe('general/gemeinden/zh/8712_staefa_zh.png');
  });
  it('a namesake inside a longer name does not make it ambiguous', () => {
    expect(resolve('Vevey, Switzerland')).toBe('general/gemeinden/vd/1800_vevey_vd.png');
  });
  it('a duplicate file of the same Gemeinde is not ambiguous', () => {
    expect(resolve('Payerne, Switzerland')).toBe('general/gemeinden/vd/1530_payerne_vd.png');
  });
  it('either half of a two-language name', () => {
    expect(resolve('Biel, Switzerland')).toBe('general/gemeinden/be/2502_biel-bienne_be.png');
    expect(resolve('Genf, Switzerland')).toBe('general/gemeinden/ge/1201_geneve_ge.png');
  });
  it('English exonyms', () => {
    expect(resolve('Geneva, Switzerland')).toBe('general/gemeinden/ge/1201_geneve_ge.png');
  });
  it('an exact name beats a part of a hyphenated one', () => {
    expect(resolve('Biel, Switzerland')).toBe('general/gemeinden/be/2502_biel-bienne_be.png');
  });
  it('Rapperswil means Rapperswil-Jona unless a canton code says otherwise', () => {
    expect(resolve('Rapperswil, Seestern')).toBe('general/gemeinden/sg/8640_rapperswil-jona_sg.png');
  });
  it('a part of a hyphenated name, told apart by the canton code', () => {
    expect(resolve('Rapperswil SG')).toBe('general/gemeinden/sg/8640_rapperswil-jona_sg.png');
    expect(resolve('Rapperswil BE')).toBe('general/gemeinden/be/3255_rapperswil_be.png');
  });
});

describe('resolveLocationAvatarPath — canton / Bundesland', () => {
  it('ambiguous name in Switzerland → no Gemeinde, no common canton → country', () => {
    expect(resolve('Buchs, Switzerland')).toBe('general/laender/schweiz.svg');
  });
  it('unknown Gemeinde with a canton code → canton', () => {
    expect(resolve('Hintertupfingen ZH')).toBe('general/kantone/zh.svg');
  });
  it('a shared PLZ without a matching place → the canton of that PLZ', () => {
    expect(resolve('x', '3053 Somewhere, Switzerland')).toBe('general/kantone/be.svg');
  });
  it('a canton capital without its own Wappen → its canton', () => {
    expect(resolve('Luzern, Switzerland')).toBe('general/kantone/lu.svg');
    expect(resolve('Lucerne, Switzerland')).toBe('general/kantone/lu.svg');
  });
  it('a Bundesland in the address', () => {
    expect(resolve('Munich, Bavaria, Germany')).toBe('general/deutschland_bundeslaender/bayern.svg');
  });
  it('a city state', () => {
    expect(resolve('Berlin, Germany')).toBe('general/deutschland_bundeslaender/berlin.svg');
  });
});

describe('resolveLocationAvatarPath — country / nothing', () => {
  it('unknown Swiss place → Swiss flag', () => {
    expect(resolve('Adelboden, Switzerland')).toBe('general/laender/schweiz.svg');
  });
  it('German place without Bundesland → German flag', () => {
    expect(resolve('x', 'Marienplatz 1, 80331 München, Germany')).toBe('general/laender/deutschland.svg');
  });
  it('English country names', () => {
    expect(resolve('Äkäslompolo, Finland')).toBe('general/laender/finnland.svg');
    expect(resolve('Alnwick, United Kingdom')).toBe('general/laender/uk.svg');
  });
  it('German country names', () => {
    expect(resolve('Wien, Österreich')).toBe('general/laender/oesterreich.svg');
  });
  it('a foreign place never gets a Swiss coat of arms', () => {
    expect(resolve('Aarau, Finland')).toBe('general/laender/finnland.svg');
  });
  it('a country without a flag file → nothing', () => {
    expect(resolve('Paris, France')).toBeUndefined();
  });
  it('free text → nothing', () => {
    expect(resolve('Andere Strecke')).toBeUndefined();
  });
  it('the most specific of name and address wins', () => {
    expect(resolve('Stäfa', 'Seestrasse 5, Switzerland')).toBe('general/gemeinden/zh/8712_staefa_zh.png');
  });
});

describe('planLocationAvatar', () => {
  const loc = { name: 'Aarau, Switzerland' };
  const aarau = 'general/gemeinden/ag/5000_aarau_ag.png';
  it('creates a missing avatar', () => {
    expect(planLocationAvatar(loc, undefined, catalog)).toEqual({ kind: 'set', storagePath: aarau });
  });
  it('leaves an up-to-date avatar alone', () => {
    expect(planLocationAvatar(loc, { storagePath: aarau }, catalog)).toEqual({ kind: 'skip' });
  });
  it('never replaces a hand-uploaded picture', () => {
    expect(planLocationAvatar(loc, { storagePath: 'tenant/bka/location/x/avatar/a.jpg' }, catalog)).toEqual({ kind: 'skip' });
  });
  it('updates a generated avatar that no longer fits', () => {
    expect(planLocationAvatar(loc, { storagePath: 'general/laender/schweiz.svg' }, catalog)).toEqual({ kind: 'set', storagePath: aarau });
  });
  it('removes a generated avatar when the location is deleted or no longer resolves', () => {
    expect(planLocationAvatar(undefined, { storagePath: aarau }, catalog)).toEqual({ kind: 'delete' });
    expect(planLocationAvatar({ name: 'Andere Strecke' }, { storagePath: aarau }, catalog)).toEqual({ kind: 'delete' });
  });
});
