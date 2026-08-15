import { describe, expect, it } from 'vitest';

import { AvatarInfo, MeetingModel } from '@okr/shared-models';

import { buildMinutesDocument, MinutesDocumentOptions } from './meeting.html';
import { newAgendaItem } from './meeting.util';

const avatar = (name1: string, name2: string): AvatarInfo => ({
  key: name1, name1, name2, modelType: 'person', type: '', subType: '', label: '',
});

const options: MinutesDocumentOptions = {
  tenantName: 'Seeclub Stäfa',
  meetingDate: '01.09.2026',
  generatedOn: '02.09.2026',
  labels: {
    title: 'Protokoll', date: 'Datum', location: 'Ort', attendees: 'Teilnehmende',
    present: 'Anwesend', excused: 'Entschuldigt', absent: 'Abwesend', invited: 'Eingeladen',
    agenda: 'Traktanden', minutes: 'Protokoll', decision: 'Beschluss', generated: 'Erstellt am',
  },
};

const meeting = (): MeetingModel => {
  const m = new MeetingModel('scs');
  m.name = 'Vorstandssitzung 3/2026';
  m.startTime = '19:00';
  m.locationKey = 'Clubhaus';
  m.attendees = [
    { person: avatar('Anna', 'Muster'), state: 'present' },
    { person: avatar('Beat', 'Beispiel'), state: 'excused' },
  ];
  return m;
};

describe('buildMinutesDocument', () => {
  it('renders the header, the meeting date and the location', () => {
    const html = buildMinutesDocument(meeting(), options);
    expect(html).toContain('Protokoll — Vorstandssitzung 3/2026');
    expect(html).toContain('01.09.2026');
    expect(html).toContain('Ort: Clubhaus');
  });

  it('groups the attendees by state and counts them', () => {
    const html = buildMinutesDocument(meeting(), options);
    expect(html).toContain('<strong>Anwesend</strong> (1)');
    expect(html).toContain('Anna Muster');
    expect(html).toContain('<strong>Entschuldigt</strong> (1)');
    // states nobody has are left out entirely
    expect(html).not.toContain('Abwesend');
  });

  it('numbers the agenda items and renders minutes and decisions', () => {
    const m = meeting();
    const info = newAgendaItem(m.agenda, 'Jahresrechnung', 'decision');
    info.minutes = 'Der Kassier erläutert die Zahlen.';
    info.decision = 'Einstimmig genehmigt.';
    info.owner = avatar('Cla', 'Kassier');
    m.agenda = [info, newAgendaItem([info], 'Varia', 'info')];

    const html = buildMinutesDocument(m, options);
    expect(html).toContain('1. Jahresrechnung');
    expect(html).toContain('2. Varia');
    expect(html).toContain('Der Kassier erläutert die Zahlen.');
    expect(html).toContain('<strong>Beschluss:</strong> Einstimmig genehmigt.');
    expect(html).toContain('Cla Kassier');
  });

  it('escapes user input — puppeteer executes what it is given', () => {
    const m = meeting();
    const item = newAgendaItem([], '<script>alert(1)</script>');
    item.minutes = '<img onerror="x">';
    m.agenda = [item];

    const html = buildMinutesDocument(m, options);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img onerror=');
    expect(html).toContain('&lt;script&gt;');
  });

  it('survives an empty meeting', () => {
    const html = buildMinutesDocument(new MeetingModel('scs'), options);
    expect(html).toContain('Traktanden');
    expect(html).toContain('Erstellt am 02.09.2026');
  });
});
