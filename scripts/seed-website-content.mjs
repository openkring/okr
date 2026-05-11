/**
 * One-time seed script: populates the websiteContent Firestore collection
 * with all i18n strings from the SCS static website.
 *
 * Run with:  node scripts/seed-website-content.mjs
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const TENANT = 'scs';
const COLLECTION = 'websiteContent';

// All strings from shared.js + index.html homeStrings
const strings = {
  // ── Navigation ──────────────────────────────────────────
  'nav.club':        { de: 'Verein',              en: 'Club' },
  'nav.about':       { de: 'Über uns',             en: 'About us' },
  'nav.history':     { de: 'Geschichte',           en: 'History' },
  'nav.boathouse':   { de: 'Neues Bootshaus',      en: 'New boathouse' },
  'nav.rowing':      { de: 'Rudern',               en: 'Rowing' },
  'nav.courses':     { de: 'Kurse für Einsteiger', en: 'Beginner courses' },
  'nav.youth':       { de: 'Jugendrudern',         en: 'Youth rowing' },
  'nav.competitive': { de: 'Leistungssport',       en: 'Competitive' },
  'nav.lateral':     { de: 'Quereinstieg',         en: 'Experienced rowers' },
  'nav.events':      { de: 'Termine',              en: 'Events' },
  'nav.news':        { de: 'News',                 en: 'News' },
  'nav.contact':     { de: 'Kontakt',              en: 'Contact' },
  'nav.login':       { de: 'Mitgliederbereich',    en: 'Member area' },

  // ── Footer ───────────────────────────────────────────────
  'footer.tagline':  { de: 'Rudern auf dem Zürichsee seit 1917.', en: 'Rowing on Lake Zürich since 1917.' },
  'footer.links':    { de: 'Links',                en: 'Links' },
  'footer.member':   { de: 'Mitgliederbereich',    en: 'Member area' },
  'footer.calendar': { de: 'Kalender',             en: 'Calendar' },
  'footer.newsLink': { de: 'News',                 en: 'News' },
  'footer.contact':  { de: 'Kontakt',              en: 'Contact' },
  'footer.follow':   { de: 'Folge uns',            en: 'Follow us' },
  'footer.imprint':  { de: 'Impressum',            en: 'Imprint' },
  'footer.privacy':  { de: 'Datenschutz',          en: 'Privacy' },

  // ── Common ───────────────────────────────────────────────
  'common.back':     { de: '← Zurück',             en: '← Back' },
  'common.loading':  { de: 'Wird geladen …',        en: 'Loading …' },
  'common.error':    { de: 'Inhalte konnten nicht geladen werden.', en: 'Could not load content.' },
  'common.readMore': { de: 'Weiterlesen →',         en: 'Read more →' },

  // ── News ─────────────────────────────────────────────────
  'news.title':      { de: 'News & Erfolge',       en: 'News & results' },
  'news.lead':       { de: 'Aktuelles aus dem Vereinsleben, Erfolge an Regatten und Hintergründe zu unseren Projekten.', en: 'Updates from our club, regatta results, and stories behind our projects.' },
  'news.allTags':    { de: 'Alle',                 en: 'All' },
  'news.kicker':     { de: 'Aktuell',              en: 'Latest' },
  'news.titleHome':  { de: 'News & Erfolge',       en: 'News & results' },
  'news.all':        { de: 'Alle News →',          en: 'All news →' },

  // ── Calendar / Termine ───────────────────────────────────
  'calendar.title':          { de: 'Termine',            en: 'Events' },
  'calendar.lead':           { de: 'Anlässe, Regatten und Vereinstermine im Überblick.', en: 'Events, regattas, and club activities at a glance.' },
  'calendar.filter.all':     { de: 'Alle',               en: 'All' },
  'calendar.filter.regatta': { de: 'Regatten',           en: 'Regattas' },
  'calendar.filter.club':    { de: 'Vereinsanlässe',     en: 'Club events' },
  'calendar.filter.course':  { de: 'Kurse',              en: 'Courses' },
  'calendar.empty':          { de: 'Keine Termine in dieser Kategorie.', en: 'No events in this category.' },
  'events.kicker':           { de: 'Agenda',             en: 'Agenda' },
  'events.title':            { de: 'Nächste Termine',    en: 'Upcoming events' },
  'events.all':              { de: 'Alle Termine →',     en: 'All events →' },

  // ── Contact ──────────────────────────────────────────────
  'contact.title':                 { de: 'Kontakt',             en: 'Contact' },
  'contact.lead':                  { de: 'Du hast Fragen zum Verein, zu Kursen oder zum Bootshaus-Projekt? Wir freuen uns auf deine Nachricht.', en: 'Questions about the club, our courses or the boathouse project? We look forward to hearing from you.' },
  'contact.address':               { de: 'Adresse',             en: 'Address' },
  'contact.email':                 { de: 'E-Mail',              en: 'Email' },
  'contact.social':                { de: 'Social',              en: 'Social' },
  'contact.form.title':            { de: 'Nachricht senden',    en: 'Send a message' },
  'contact.form.name':             { de: 'Name',                en: 'Name' },
  'contact.form.email':            { de: 'E-Mail',              en: 'Email' },
  'contact.form.subject':          { de: 'Betreff',             en: 'Subject' },
  'contact.form.subject.general':  { de: 'Allgemeine Anfrage',  en: 'General enquiry' },
  'contact.form.subject.course':   { de: 'Kursanmeldung',       en: 'Course registration' },
  'contact.form.subject.lateral':  { de: 'Quereinstieg',        en: 'Experienced rower' },
  'contact.form.subject.youth':    { de: 'Jugendrudern',        en: 'Youth rowing' },
  'contact.form.subject.boathouse':{ de: 'Bootshaus-Projekt',   en: 'Boathouse project' },
  'contact.form.message':          { de: 'Nachricht',           en: 'Message' },
  'contact.form.submit':           { de: 'Nachricht senden',    en: 'Send message' },
  'contact.form.hint':             { de: 'Formularversand erfolgt über den Mitgliederbereich. Du wirst weitergeleitet.', en: 'Form submission runs through the member area. You will be redirected.' },

  // ── Boathouse ────────────────────────────────────────────
  'boathouse.page.title':    { de: 'Neubau Bootshaus',       en: 'New boathouse' },
  'boathouse.page.lead':     { de: 'Ein neues Zuhause für den Rudersport in Stäfa.', en: 'A new home for rowing in Stäfa.' },
  'boathouse.facts.title':   { de: 'Eckdaten',               en: 'Key facts' },
  'boathouse.facts.year':    { de: 'Geplante Eröffnung',     en: 'Planned opening' },
  'boathouse.facts.material':{ de: 'Hauptmaterial',          en: 'Main material' },
  'boathouse.facts.boats':   { de: 'Bootskapazität',         en: 'Boat capacity' },
  'boathouse.facts.area':    { de: 'Nutzfläche',             en: 'Usable floor space' },
  'boathouse.story.title':   { de: 'Warum wir bauen',        en: 'Why we are building' },
  'boathouse.story.p1':      { de: 'Das heutige Bootshaus stammt aus einer Zeit, in der unser Verein deutlich kleiner war. Mit über 100 aktiven Mitgliedern, einer wachsenden Jugendabteilung und ambitionierten Leistungssportlern stossen wir an räumliche Grenzen.', en: 'The current boathouse dates back to a time when our club was much smaller. With more than 100 active members, a growing youth programme and ambitious athletes, we have outgrown the space.' },
  'boathouse.story.p2':      { de: 'Der Neubau ist nachhaltig konzipiert, fügt sich in die Uferlandschaft ein und schafft Platz für die nächsten Generationen am Zürichsee.', en: 'The new building is designed sustainably, blends into the lakeside landscape, and creates room for the next generations on Lake Zürich.' },
  'boathouse.support.title': { de: 'Projekt unterstützen',   en: 'Support the project' },
  'boathouse.support.lead':  { de: 'Der Neubau wird durch Mitgliederbeiträge, Stiftungen und private Gönnerinnen und Gönner finanziert.', en: 'The new boathouse is financed by membership contributions, foundations, and private donors.' },
  'boathouse.support.cta':   { de: 'Im Mitgliederbereich mehr erfahren →', en: 'Learn more in the member area →' },
  'boathouse.kicker':        { de: 'Grossprojekt',           en: 'Major project' },
  'boathouse.title':         { de: 'Neubau Bootshaus',       en: 'New boathouse' },
  'boathouse.lead':          { de: 'Wir bauen ein neues Zuhause für unseren Sport. Modern, nachhaltig und offen für die nächsten Generationen am Zürichsee.', en: 'A new home for our sport. Modern, sustainable, open for the next generations.' },
  'boathouse.cta':           { de: 'Projekt entdecken →',    en: 'Discover the project →' },
  'boathouse.caption':       { de: 'Visualisierung Neubau',  en: 'New boathouse – visualisation' },

  // ── Hero / About / Offers (homepage) ─────────────────────
  'hero.kicker':             { de: 'Seit 1917 am Zürichsee', en: 'On Lake Zürich since 1917' },
  'hero.title':              { de: 'Seeclub Stäfa',          en: 'Seeclub Stäfa' },
  'hero.subtitle':           { de: 'Rudern auf dem Zürichsee.', en: 'Rowing on Lake Zürich.' },
  'hero.lead':               { de: 'Breitensport, Leistungssport und Jugendförderung – seit über 100 Jahren. Komm vorbei, lern uns kennen und entdecke eine der schönsten Sportarten der Welt.', en: 'Recreational rowing, competitive sport and youth development – for more than 100 years.' },
  'hero.cta1':               { de: 'Kurs entdecken',         en: 'Discover courses' },
  'hero.cta2':               { de: 'Verein kennenlernen',    en: 'About the club' },
  'about.kicker':            { de: 'Über uns',               en: 'About us' },
  'about.title':             { de: 'Ein Verein mit Geschichte und Zukunft', en: 'A club with history and future' },
  'about.p1':                { de: 'Der Seeclub Stäfa wurde 1917 gegründet und gehört zu den traditionsreichsten Ruderclubs am Zürichsee. Wir vereinen Breitensport, ambitionierten Leistungssport und engagierte Jugendförderung unter einem Dach.', en: 'Founded in 1917, Seeclub Stäfa is one of the most traditional rowing clubs on Lake Zürich.' },
  'about.p2':                { de: 'Ob du das erste Mal in ein Boot steigst oder bereits an Regatten startest – bei uns findest du das passende Umfeld, erfahrene Trainerinnen und Trainer und eine Community, die den Sport und den See liebt.', en: 'Whether it is your first time in a boat or you already race regattas – you will find the right setting and a community that loves the sport.' },
  'about.stat1':             { de: 'Gegründet',              en: 'Founded' },
  'about.stat2':             { de: 'Aktive Mitglieder',      en: 'Active members' },
  'about.stat3':             { de: 'Sparten: Breite, Jugend, Leistung', en: 'Branches: recreational, youth, competitive' },
  'about.stat4':             { de: 'Tage Seeluft pro Jahr',  en: 'Days of lake air per year' },
  'offers.kicker':           { de: 'Mitmachen',              en: 'Get involved' },
  'offers.title':            { de: 'So findest du den Einstieg', en: 'Find your way in' },
  'offers.lead':             { de: 'Vier Wege ins Boot – wähle deinen.', en: 'Four ways into the boat – pick yours.' },
  'offers.course.title':     { de: 'Einsteigerkurs',         en: 'Beginner course' },
  'offers.course.desc':      { de: 'Der direkte Weg ins Boot. Lerne in wenigen Wochen die Grundlagen des Ruderns.', en: 'The direct path into the boat.' },
  'offers.youth.title':      { de: 'Jugendrudern',           en: 'Youth rowing' },
  'offers.youth.desc':       { de: 'Für Jugendliche ab ca. 12 Jahren. Spass, Teamgeist und sportliche Entwicklung.', en: 'For young people from about 12 years.' },
  'offers.competitive.title':{ de: 'Leistungssport',         en: 'Competitive' },
  'offers.competitive.desc': { de: 'Trainiere ambitioniert und starte für den Seeclub Stäfa an nationalen und internationalen Regatten.', en: 'Train ambitiously and race for Seeclub Stäfa.' },
  'offers.lateral.title':    { de: 'Quereinstieg',           en: 'Experienced rowers' },
  'offers.lateral.desc':     { de: 'Du hast bereits Rudererfahrung? Bewirb dich direkt für einen Quereinstieg.', en: 'Already have rowing experience? Apply directly to join us.' },
  'offers.cta':              { de: 'Mehr erfahren →',        en: 'Learn more →' },
};

async function seed() {
  const entries = Object.entries(strings);
  console.log(`Seeding ${entries.length} websiteContent documents for tenant "${TENANT}" …`);

  let created = 0;
  for (const [key, { de, en }] of entries) {
    await db.collection(COLLECTION).doc(key).set({
      key,
      de,
      en,
      isHtml: false,
      tenants: [TENANT],
      isArchived: false,
    });
    process.stdout.write('.');
    created++;
  }

  console.log(`\nDone. Created/updated ${created} documents.`);
}

seed().catch(err => { console.error(err); process.exit(1); });
