/**
 * One-time migration: the static content of the old WordPress site seeclub-staefa.ch/wp into the
 * prepared website pages of tenant scs (pages/scsw_*), rendered by /web/seite.html?key=scsw_*.
 *
 * One ArticleSection per chapter of the old page; the chapter's image is copied from WordPress
 * (full-size original) to Storage `tenant/scs/section/<sectionKey>/image/<file>` and referenced by
 * that relative path (imgix renders it, see the `images` skill).
 *
 * Idempotent: a section is found again by its `name` (scsw_<page>_<n>) and updated in place; the
 * page's `sections` list gets the new keys inserted before its form section (else appended).
 * Existing sections that are not part of this migration (e.g. scsw_ls1, the *_form sections) are
 * never touched.
 *
 * Run (dry run, default):  node scripts/migrate-scs-wp-content.mjs
 * Run (apply writes):      node scripts/migrate-scs-wp-content.mjs --apply
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org', storageBucket: 'bkaiser-org.appspot.com' });
}
const db = getFirestore();
const bucket = getStorage().bucket();

const APPLY = process.argv.includes('--apply');
const TENANT = 'scs';
const WP = 'https://seeclub-staefa.ch/wp/wp-content/uploads/';
const WEB = 'https://seeclub.org/web/seite.html?key=';

/** image: [wp upload path (full-size original), caption] */
const img = (path, caption = '', alt = caption) => ({ path, caption, alt });

// ------------------------------------------------------------------------------------------------
// Content — one entry per chapter. Source: seeclub-staefa.ch/wp (WordPress REST API, 2026-11-10).
// ------------------------------------------------------------------------------------------------
const PAGES = {
  // wp: leistungssport (16) — chapter 1 already exists as section scsw_ls1
  scsw_leistungssport: [
    {
      name: 'scsw_ls2', title: 'Ruderkurse für Jugendliche',
      image: img('2023/01/B8067B8B-B608-4459-BDFE-748B2C77575A.jpg', 'Erfolgreiche Juniorinnen an der Greifensee Regatta'),
      html: `<p>Für Jugendliche ab 12 Jahren veranstalten wir regelmässig <a href="${WEB}scsw_kurs_jugendliche">Ruderkurse</a>.</p>
<p>Die Teilnehmenden haben anschliessend die Möglichkeit, entweder in die Leistungssportgruppe einzutreten oder im Breitensport mitzumachen. Auskunft erteilt Fabio Razzai, <a href="mailto:fabio@razzai.ch">fabio@razzai.ch</a></p>`,
    },
    {
      name: 'scsw_ls3', title: 'Masters Racing',
      image: img('2021/11/SCSTAEFA_O3I0147.jpg', 'Clubregatta 2021'),
      html: `<p>Die sogenannte Master Klasse steht allen erwachsenen Alterskategorien offen. Auch hier ist der Seeclub Stäfa mit unterschiedlichen Booten immer wieder auf den Regattaplätzen vertreten.</p>`,
    },
  ],

  // wp: breitensport (17)
  scsw_breitensport: [
    {
      name: 'scsw_bs1', title: 'Breitensport',
      image: img('images/breitensport/Breitensport.jpg', 'Bilac mit Stäfner Beteiligung'),
      html: `<p>Rudern ist ein ausgezeichneter Fitness-Sport. Er erfordert Koordination, Konzentration, Beweglichkeit, Kraft und Ausdauer.</p>
<p>Wer sportlich bereits aktiv ist, eine gute Beweglichkeit und Koordinationsfähigkeit mitbringt, hat gute Voraussetzungen, den technisch anspruchsvollen Rudersport zu erlernen.</p>`,
    },
    {
      name: 'scsw_bs2', title: 'Angebot',
      images: [img('2021/03/STÄFA_O3I5247.jpeg', 'Breitensportausfahrt 2020'), img('2026/10/IMG_7196.jpeg', 'Breitensport Ausfahrt 2026')],
      html: `<p>Was gibt es Schöneres, als frühmorgens bei Sonnenaufgang auf dem Zürichsee unterwegs zu sein?<br>Ein vielfältiges Angebot ist auf die Fitnesssportlerinnen und Fitnesssportler des Seeclubs Stäfa zugeschnitten.</p>
<p>Ob im breiten C-Gig oder den schmalen Rennbooten: Im Zentrum stehen das ganze Jahr hindurch die wöchentlichen Ausfahrten an den durch Instruktorinnen und Instruktoren begleiteten Breitensport-Terminen. Erfahrene Mitglieder organisieren sich auch selbst für Ausfahrten in den verschiedensten Zusammensetzungen.</p>
<p>Im Winter bieten wir Indoor-Rowing-Trainings und ein Hallentraining an. Wanderfahrten und Plauschregatten runden das vielfältige Angebot ab. Neben dem Sport kommt aber auch das Gesellige nie zu kurz. Dazu gehören auch die obligatorischen Arbeitseinsätze, um den Bootspark und die Clubanlagen zu pflegen.</p>`,
    },
    {
      name: 'scsw_bs4', title: 'Ruderkurse für Erwachsene',
      html: `<p>Wir organisieren Grundkurse für Erwachsene. Anschliessend sind die Teilnehmenden in der Lage, im Breitensport mitzurudern und weiter an der Technik zu arbeiten.</p>
<p><strong>Die Ruderkurse</strong> (total ca. 12 Stunden an Wochenenden und frühmorgens während der Woche) finden jeweils im Frühling statt und sind sehr begehrt, was uns freut. Unsere Ausbildungskapazitäten sind aber begrenzt. <strong>Im Moment besteht eine Wartezeit von ca. zwei Jahren</strong>, bis man einen Kurs besuchen kann. Der für 2027/2028 geplante Neubau des Bootshauses wird den Ruderbetrieb zudem einschränken.</p>
<p><strong>Voraussetzungen für den Kurs sind:</strong></p>
<ul>
<li>Teilnahme an einer Infoveranstaltung vor dem Kurs</li>
<li>300 m im See schwimmen zu können</li>
<li>Gute Ausdauer, Koordination und Beweglichkeit</li>
<li>Wohnort Stäfa oder angrenzende Gemeinden</li>
<li>Nach dem Kurs Zeit haben, <strong>um ein- bis zweimal pro Woche an den Breitensport-Terminen</strong> teilzunehmen und pro Ausfahrt ca. zwei Stunden zu investieren.</li>
</ul>
<p>Zudem muss man gewillt sein, die eigene Rudertechnik ständig zu verbessern, entweder bei clubinternen Aufbaukursen oder in einer Ruderschule (z.B. bei Row&amp;Row). Wer einen Grundkurs im Seeclub Stäfa erfolgreich absolviert hat, kann sich anschliessend als Kandidatin / Kandidat für den Breitensport anmelden. Die Breitensport-Ausfahrten für Kandidatinnen und Kandidaten finden am Samstagvormittag und im Sommerhalbjahr zusätzlich am Dienstagabend statt. Zusätzlich werden je nach Verfügbarkeit der clubinternen Instruktorinnen und Instruktoren auch zusätzliche Termine unter der Woche angeboten.</p>
<p><strong>Wir führen eine Warteliste für die Kurse 2027 / 2028.</strong> Hier geht es zum <a href="${WEB}scsw_kurs_erwachsene">Anmeldeformular</a>.</p>`,
    },
  ],

  // the course chapter of breitensport is shared (same section doc) — the form follows below it
  scsw_kurs_erwachsene: [{ ref: 'scsw_bs4' }],

  // wp: ruderkurs-fur-jugendliche-2024 (3501) + note of the registration page (3520)
  scsw_kurs_jugendliche: [
    {
      name: 'scsw_kj1', title: 'Lerne rudern und werde Teil unserer Ruderfamilie!',
      image: img('2024/06/image00010.jpeg', '', 'Jugendliche beim Rudern'),
      html: `<p>Treibst du gerne Sport in der Natur zusammen mit anderen Jugendlichen? Dann bist du im Seeclub Stäfa richtig: Als Juniorin oder Junior erwartet dich ein vielseitiges Training auf und neben dem Wasser. Entdecke deinen Leistungswillen und spüre den Teamgeist beim Rudern.<br>Wir freuen uns auf dich!</p>
<p><strong>Der nächste Ruderkurs für Jugendliche</strong> findet im Frühling 2027 statt. Interessiert? Das Formular findest du weiter unten auf dieser Seite.</p>
<p>Du wirst die Grundkenntnisse des Ruderns erlernen. Zunächst machst du dich auf dem Ruderergometer mit den Grundbewegungen vertraut, bevor du bereits am ersten Tag (bei gutem Wetter) deine ersten Ruderschläge auf dem Wasser machst. Zu Beginn ruderst du noch zu viert mit einer Begleitperson im Boot.<br>Ziel des Kurses ist es, dass du gegen Ende gemeinsam mit den anderen Kursteilnehmer:innen allein im Boot sitzt.</p>
<p><em>Hinweis: Der Kurs ist als Einstieg gedacht – wir freuen uns, wenn du nach dem Kurs im Club dabeibleibst und vielleicht später auch Teil unseres Regattateams wirst.</em></p>`,
    },
    {
      name: 'scsw_kj2', title: 'Nach dem Kurs',
      html: `<p><strong>Ausblick</strong><br>Nach dem Einführungskurs solltest du regelmässig ein- bis zweimal wöchentlich zum Training kommen (Mittwoch- und Freitagabend), um deine Ruderkenntnisse stetig zu verbessern.<br>Im Winterhalbjahr bieten wir zudem ein abwechslungsreiches Hallentraining (Kondition, Koordination, (Rumpf-)Kraft, Dehnen, Ballspiele) in der Turnhalle Beewies in Stäfa an (Dienstag- und Freitagabend, 18 Uhr bis 20 Uhr). Der Besuch eines dieser Hallentrainings ist eine vielfältige und spassige Ergänzung zum Wassertraining am Mittwoch von 18 Uhr bis 20 Uhr.</p>
<p><strong>Wettkämpfe</strong><br>Bereits im Jahr nach dem Kurs kannst du dich mit anderen Ruderinnen und Ruderern deiner Altersklasse an den ersten Regatten messen.</p>
<p><strong>Anforderungen</strong><br>Mindestalter 12 Jahre, gute Schwimmkenntnisse und Freude am Wasser</p>
<p><strong>Kursleitung</strong><br>Der Kurs wird von erfahrenen Trainerinnen und Trainern geleitet. Nach dem Kurs hast du die Möglichkeit, mit deinen Ruderkolleginnen und -kollegen regelmässig im Seeclub zu trainieren: im Ruderboot, im Fitnessraum oder im Winter auch in der Sporthalle.</p>`,
    },
  ],

  // wp: alt-herren-gonnerverein (139)
  scsw_altherren: [
    {
      name: 'scsw_ah1', title: 'Alt Herren',
      html: `<p>Die Alt Herren des Seeclubs Stäfa sind ein Verein aktiver und/oder ehemaliger Ruderer, die die Gemeinschaft untereinander pflegen, auch wenn eine Rudertätigkeit aus altersbedingten oder gesundheitlichen Gründen nicht mehr möglich ist. So soll es Ziel sein, jahrelange Boots- und Clubkameradschaften aufrechterhalten zu können.</p>
<p>Der Ertrag des Jahresbeitrages erlaubt es, den Seeclub auf Anfrage bei der Anschaffung von Bootsmaterial und dergleichen finanziell zu unterstützen. Dies bedingt einen engen Kontakt zwischen AH und dem Seeclub. Die Vorsteherschaft der AH ist unkompliziert; Obmann und Sekretär werden je für ein Jahr bestimmt.</p>
<p>Die AH sind eine traditionelle, dem Seeclub zugewandte Institution. Männer ab 28 können dabei sein; auch ehemalige Seeclübler dürfen den Weg zu den AH zurückfinden, ohne wiederum Mitglied des SCS werden zu müssen.</p>`,
    },
  ],

  // wp: praeventionsstelle (3708)
  scsw_praeventionsstelle: [
    {
      name: 'scsw_pv1', title: 'Präventionsstelle',
      image: img('2023/08/Bildschirmfoto-2023-08-22-um-15.39.25.png', '', 'Anna Ingenhoven, Präventionsverantwortliche'),
      html: `<p>Alle Mitglieder sollen sich bei uns im Seeclub Stäfa wohl fühlen. Ein offener, respektvoller und freundlicher Umgang untereinander soll gefördert und ein Sensorium für mögliche Probleme entwickelt werden.</p>
<p>Ein besonderes Augenmerk gilt dabei der Gesundheit und dem Wohlergehen der Juniorinnen und Junioren. Mit der Schaffung einer Präventionsstelle unterstreichen wir die Wichtigkeit dieses Anliegens.</p>
<p>Als <strong>Präventionsverantwortliche</strong> steht <strong>Anna Ingenhoven</strong> als erste Anlaufstelle für Mitglieder des Seeclubs, insbesondere für Juniorinnen und Junioren, zur Verfügung. Anliegen und Anfragen für ein Gespräch können direkt per E-Mail an sie gerichtet werden: <a href="mailto:praevention@seeclub.org">praevention@seeclub.org</a>.<br>Die Anliegen werden vertraulich behandelt, je nach Problemstellung wird Dieter Widmer als Clubpräsident einbezogen.</p>
<p>Anna Ingenhoven vertritt den Seeclub auch als Präventionsbeauftragte bei entsprechenden Infoveranstaltungen und Workshops der Gemeinde Stäfa.</p>`,
    },
    {
      name: 'scsw_pv2', title: 'Ethik im Sport',
      html: `<p>Die Präventionsstelle des Seeclubs ist zuständig für die Beachtung und Umsetzung des <a href="https://www.swissolympic.ch/athleten-trainer/werte-ethik/Ethik-Statut-des-Schweizer-Sports">Ethik-Statuts des Schweizer Sports</a>, welches Ende 2022 in Kraft gesetzt wurde.<br>Die Podcast-Reihe «<a href="https://www.swissolympic.ch/verbaende/werte-ethik/Podcast-Folgen-zu-Ethik-im-Sport">Spirit of Sport</a>» von Swiss Olympic beleuchtet die vier Ethik-Kernthemen Leistungsdruck, Nähe, Ideale und Macht.</p>
<p>Neben dem Ethik-Statut beachtet der Seeclub Stäfa auch die neun Prinzipien der <a href="https://www.swissolympic.ch/athleten-trainer/werte-ethik/ethik-charta">Ethik-Charta im Sport</a>. Diese Charta wurde von verschiedenen Sportverbänden in der Schweiz entwickelt und hat zum Ziel, die Werte und Normen im Sport zu fördern und zu schützen.</p>
<p>Ein weiteres Instrument ist der Swiss Olympic Ethik-Kompass, eine Orientierungshilfe, ein Handlungswegweiser und ein Sensibilisierungstool. Der Kompass bietet konkrete Tipps, Hilfestellungen und Handlungsmöglichkeiten und dient der Sensibilisierung für die Ethik-Themen im Clubleben: <a href="https://www.youtube.com/watch?v=2vqOgHsDdxg">Erklärvideo zum Ethik-Kompass</a>.</p>`,
    },
  ],

  // wp: bootshaus-projekt (5580) + beleuchtender-bericht-gemeinde-staefa (5858) + aktuelles-projekt (5855)
  scsw_bootshausprojekt: [
    {
      name: 'scsw_bh1', title: 'Neubau Bootshaus',
      image: img('2025/11/Bildschirmfoto-2025-11-16-um-15.31.41.png', 'Visualisierung Stand 2024'),
      html: `<p>Unser Bootshaus ist in die Jahre gekommen und entspricht den heutigen Anforderungen vom Platz und der Infrastruktur her nicht mehr. Mit dem <a href="${WP}2026/05/Praesentation_260526.pdf">Neubau</a> planen wir ein echtes Generationen-Projekt. Im September 2025 haben wir die Baubewilligung erhalten, jetzt gilt es, die Finanzierung sicherzustellen.</p>
<p><a href="${WP}2026/05/Praesentation_260526.pdf">Präsentation zum Projekt (PDF)</a></p>`,
    },
    {
      name: 'scsw_bh2', title: 'Projekt unterstützen',
      image: img('2025/11/scsTwintQRCodeBootshaus.png', '', 'TWINT QR-Code für Spenden an das Bootshaus-Projekt'),
      html: `<p>Grosse und kleine Spenden (<a href="${WP}2025/12/20251204_Formular_Bootshaus-Finanzierung_form_def.pdf">siehe Formular</a>) sind herzlich willkommen!</p>
<p><strong>IBAN:</strong> CH67 0070 0110 4044 7417 6<br>oder mit TWINT über den QR-Code.</p>`,
    },
    {
      name: 'scsw_bh3', title: 'Gemeindeversammlung vom 15. Juni 2026',
      html: `<p>Wir freuen uns sehr, dass die Gemeindeversammlung Stäfa vom 15. Juni 2026 den Anträgen des Gemeinderats zur Erneuerung des Baurechtsvertrags um 30 Jahre bis 2056 und zur Mitfinanzierung des Ersatzneubaus des Bootshauses mit einem einmaligen Gemeindebeitrag von CHF 300'000 und einem zinslosen Darlehen von CHF 300'000 mit Amortisationsdauer von 30 Jahren mit grosser Mehrheit zugestimmt hat.</p>
<p><strong>Wir danken dem Gemeinderat und allen Stäfnerinnen und Stäfnern, die uns unterstützt haben, herzlich für ihr Vertrauen.</strong></p>
<p><a href="${WP}2026/05/Beleuchtender-Bericht-Seegrundstueck-im-Haexetanz-GV-vom-15.-Juni-2026.pdf">Beleuchtender Bericht der Gemeinde Stäfa (PDF)</a></p>`,
    },
  ],

  // wp: reglemente (294)
  scsw_statuten: [
    {
      name: 'scsw_st1', title: 'Statuten und Reglemente für den Ruderbetrieb',
      html: `<ul>
<li><a href="${WP}2025/11/20251030scsStatuten_signed.pdf">Statuten 2025 Seeclub Stäfa</a></li>
<li><a href="https://seeclub-staefa.ch/wp/rea-bls-algorithmus-src/">Anleitung Defibrillator</a></li>
<li><a href="${WP}2020/05/Bootshandling.pdf">Bootshandling</a></li>
<li><a href="https://youtu.be/O7Yeg_NC9yc">Bootshandling Lite Duo</a> (Video)</li>
<li><a href="${WP}2020/05/Fahrordnung.pdf">Fahrordnung</a> vom und zum SCS</li>
<li><a href="${WP}2025/03/20250713scsUfenauFahrordnung.png">Fahrordnung Ufenau und Durchstich</a></li>
<li><a href="${WP}2025/05/20240805_Regl.Benutzung_Clubanlagen.pdf">Nutzung des Geländes und Bootshauses ausserhalb des Ruderbetriebs</a></li>
<li><a href="${WP}2023/01/Charta_Wassersportverb_2019.pdf">Anstand, Toleranz, Respekt – Charta der Wassersportverbände</a></li>
<li><a href="${WP}2023/08/Ethik-Statut-26.11.2022_final_Webversion_DE.pdf">Ethik-Statut des Schweizer Sports</a></li>
<li><a href="${WP}2023/08/2015_Ethik_Charta_A4_fbg_DE.pdf">Ethik-Charta im Sport</a></li>
<li><a href="${WP}2021/06/Factsheet_Sturmwarndienst_DE.pdf">Factsheet Sturmwarndienst</a></li>
</ul>`,
    },
  ],

  // wp: vorstand (87) — one chapter per Ressort
  scsw_vorstand: [
    ['vs1', 'Präsident', 'Dieter Widmer', 'praesident', '2021/09/SCSTAEFA_O3I5891.jpg'],
    ['vs2', 'Finanzen & Admin', 'Bruno Kaiser', 'kassier', '2021/09/SCSTAEFA_O3I5924.jpg'],
    ['vs3', 'Leistungssport', 'Tom Büchel', 'leistungssport', '2025/03/Tom_Web.jpg'],
    ['vs4', 'Breitensport', 'Evelyn Eisenhauer', 'breitensport', '2021/09/SCSTAEFA_O3I5868.jpg'],
    ['vs5', 'Infrastruktur', 'Rolf Brüggemann', 'infrastruktur', '2023/03/Foto-Rolf-Brueggemann.png'],
    ['vs6', 'Boote', 'Henry Fröhlich', 'boote', '2021/09/SCSTAEFA_O3I5903-scaled-e1631124459779.jpg'],
    ['vs7', 'Kommunikation', 'Ueli Lott', 'komm', '2021/09/SCSTAEFA_O3I5933.jpg'],
  ].map(([n, ressort, person, mail, path]) => ({
    name: `scsw_${n}`, title: ressort, colSize: '12,6,4',
    image: img(path, '', person),
    html: `<p><strong>${person}</strong><br><a href="mailto:${mail}@seeclub.org">${mail}@seeclub.org</a></p>`,
  })),

  // wp: kontakt (4966, 2025) + kontakt (188, map)
  scsw_kontakt: [
    {
      name: 'scsw_kt1', title: 'Kontakt',
      html: `<p><strong>Standort:</strong><br>Seeclub Stäfa, Seestrasse 2b, 8712 Stäfa</p>
<p><strong>Allgemeine Anfragen:</strong><br><a href="mailto:info@seeclub-staefa.ch">info@seeclub-staefa.ch</a></p>
<p><strong>Postadresse:</strong><br>Seeclub Stäfa, 8712 Stäfa</p>`,
    },
    {
      name: 'scsw_kt2', title: 'Wie man uns findet',
      image: img('2019/11/google-maps.png', '', 'Karte: Lage des Seeclubs Stäfa an der Seestrasse 2b'),
      html: '<p></p>',
    },
  ],

  // wp: mitgliederbeitraege (3330) — before the application form
  scsw_mitgliedschaft: [
    {
      name: 'scsw_mg1', title: 'Mitgliederbeiträge',
      html: `<table>
<thead><tr><th>Mitgliederkategorie</th><th>Betrag in CHF</th><th>Bemerkungen</th></tr></thead>
<tbody>
<tr><td>Aktive</td><td>600</td><td>+ 75 SRV-Beitrag</td></tr>
<tr><td>Eintrittsgebühr Aktive</td><td>750</td><td>einmalig, nicht rückerstattbar</td></tr>
<tr><td>Juniorinnen / Junioren</td><td>300</td><td>unter 18 Jahren</td></tr>
<tr><td>Kandidatinnen / Kandidaten</td><td>600</td><td></td></tr>
<tr><td>Passive</td><td>75</td><td></td></tr>
</tbody>
</table>`,
    },
  ],
};

// image style copied from the hand-migrated scsw_ls1 (caption bold over the top of the image)
const IMAGE_STYLE = {
  sizes: '(max-width: 1240px) 50vw, 300px', action: 1, hasPriority: false, isThumbnail: false,
  imgIxParams: '', showTitle: true, slot: 'none', showSource: true, borderRadius: '4',
  captionPosition: 'top-overlay', captionStyle: 'bold', width: '100%', border: '1px',
  height: 'auto', fill: false, captionSize: '1rem', zoomFactor: 2,
};

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const newKey = () => Array.from({ length: 20 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

/** ascii file name for storage: Ä → Ae, spaces → '-' */
function storageFileName(path) {
  const base = path.split('/').pop();
  return base.replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/[^A-Za-z0-9._-]+/g, '-');
}

async function copyImage(sectionKey, image) {
  const dest = `tenant/${TENANT}/section/${sectionKey}/image/${storageFileName(image.path)}`;
  if (!APPLY) return dest;
  const [exists] = await bucket.file(dest).exists();
  if (exists) return dest;
  // WordPress stores umlaut file names decomposed (NFD)
  const url = WP + encodeURI(image.path.normalize('NFD'));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await bucket.file(dest).save(buf, { contentType: res.headers.get('content-type') ?? undefined, resumable: false });
  console.log(`  uploaded ${dest} (${Math.round(buf.length / 1024)} KB)`);
  return dest;
}

async function findSectionByName(name) {
  const snap = await db.collection('sections').where('name', '==', name).where('tenants', 'array-contains', TENANT).get();
  if (snap.size > 1) throw new Error(`section name ${name} is not unique (${snap.size})`);
  return snap.docs[0];
}

async function upsertChapter(ch) {
  const existing = await findSectionByName(ch.name);
  const key = existing?.id ?? newKey();
  const images = [];
  for (const image of ch.images ?? (ch.image ? [ch.image] : [])) {
    const url = await copyImage(key, image);
    images.push({ url, type: 0, label: image.caption || image.alt, actionUrl: '', overlay: image.caption, credit: '', altText: image.alt });
  }
  const doc = {
    type: 'article', name: ch.name, title: ch.title, subTitle: '', color: 0, colSize: ch.colSize ?? '12',
    roleNeeded: 'contentAdmin', isArchived: false, notes: 'migriert von seeclub-staefa.ch/wp (2026-11-10)', tags: '',
    tenants: [TENANT], state: 'published',
    index: `n:${ch.name} t:article tt:${ch.title.toLowerCase().replace(/[^a-zäöü0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()} st:`,
    content: { htmlContent: ch.html.replace(/\n/g, ''), colSize: 3, position: 1 },
    properties: { images, imageStyle: IMAGE_STYLE },
  };
  console.log(`  ${existing ? 'update' : 'create'} sections/${key}  ${ch.name}  "${ch.title}"${images.length ? `  +${images.length} image(s)` : ''}`);
  if (APPLY) await db.collection('sections').doc(key).set(doc);
  return key;
}

async function main() {
  const keysByName = {};
  for (const [pageKey, chapters] of Object.entries(PAGES)) {
    console.log(`pages/${pageKey}`);
    const pageRef = db.collection('pages').doc(pageKey);
    const page = (await pageRef.get()).data();
    if (!page) throw new Error(`page ${pageKey} missing`);
    const newKeys = [];
    for (const ch of chapters) {
      if (ch.ref) {
        const key = keysByName[ch.ref] ?? (await findSectionByName(ch.ref))?.id;
        if (!key) throw new Error(`referenced section ${ch.ref} not found (run its page first)`);
        newKeys.push(key);
        console.log(`  reuse sections/${key}  ${ch.ref}`);
        continue;
      }
      const key = await upsertChapter(ch);
      keysByName[ch.name] = key;
      newKeys.push(key);
    }
    const current = page.sections ?? [];
    const toAdd = newKeys.filter(k => !current.includes(k));
    const formIdx = current.findIndex(k => k.endsWith('_form'));
    const sections = formIdx < 0 ? [...current, ...toAdd] : [...current.slice(0, formIdx), ...toAdd, ...current.slice(formIdx)];
    console.log(`  sections: ${JSON.stringify(current)} -> ${JSON.stringify(sections)}`);
    if (APPLY && toAdd.length) await pageRef.update({ sections });
  }
  console.log(APPLY ? 'applied' : '(dry run — pass --apply to write)');
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
