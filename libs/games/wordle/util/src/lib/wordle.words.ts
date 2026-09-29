import { normalizeLetters } from './wordle.letters';
import { WORDLE_LENGTHS } from './wordle.types';

/**
 * The word catalogue: common German words in their natural spelling, whitespace-separated.
 * Hand-picked for this project (MIT, like the rest of the core) — no third-party dictionary.
 *
 * The lists per length are DERIVED from this pool (`wordleWords`): every word is transcribed
 * (ä→AE, ö→OE, ü→UE, ß→SS) and grouped by its transcribed length. Words that end up shorter or
 * longer than `WORDLE_LENGTHS` are simply never used, so nobody has to count letters by hand.
 *
 * APPEND ONLY. The daily word is picked from a fixed shuffle of each derived list, so inserting,
 * removing or reordering a word changes the daily word of every day from that release on. New
 * words go at the end; the spec in `wordle.words.spec.ts` guards duplicates and spelling.
 *
 * The pool is also the ONLY place words come from — guesses are not checked against it (any
 * letter sequence of the right length is a valid guess), so a missing word never blocks a player.
 */
const WORD_POOL = `
  Baum Wald Blume Blatt Wiese Feld Berg Hügel Fluss Bach Meer Ufer Strand Insel Welle Sand Stein
  Fels Erde Himmel Wolke Regen Schnee Nebel Sturm Wind Donner Blitz Sonne Mond Stern Nacht Abend
  Morgen Mittag Sommer Winter Herbst Frost Hagel Quelle Teich Sumpf Moor Moos Gras Farn Pilz Rinde
  Wurzel Zweig Knospe Blüte Samen Ernte Acker Garten Hecke Tanne Fichte Eiche Buche Birke Linde
  Ahorn Weide Pappel Kiefer Rose Tulpe Nelke Lilie Efeu Klee Distel Kaktus Palme Wüste Oase Vulkan
  Höhle Klippe Küste Bucht Hafen Lagune Delta Kanal Graben

  Hund Katze Maus Ratte Hase Igel Fuchs Wolf Bär Luchs Hirsch Elch Dachs Otter Biber Pferd Esel
  Rind Kalb Stier Ochse Schaf Lamm Ziege Schwein Ferkel Huhn Hahn Küken Ente Gans Schwan Taube Möwe
  Adler Falke Eule Rabe Krähe Amsel Meise Fink Spatz Specht Storch Reiher Kranich Pfau Papagei
  Fisch Forelle Hecht Karpfen Lachs Hering Delfin Robbe Krabbe Hummer Muschel Qualle Frosch Kröte
  Unke Molch Echse Schlange Biene Wespe Hummel Ameise Käfer Fliege Mücke Motte Raupe Falter Spinne
  Schnecke Wurm Löwe Tiger Zebra Giraffe Affe Gorilla Elefant Nashorn Kamel Lama Panda Koala
  Pinguin Dackel Pudel Pony Fohlen Welpe

  Brot Butter Käse Milch Rahm Quark Joghurt Honig Zucker Salz Pfeffer Senf Essig Mehl Teig Kuchen
  Torte Keks Apfel Birne Kirsche Pflaume Traube Beere Banane Zitrone Orange Melone Mango Feige
  Dattel Nuss Mandel Karotte Rübe Kohl Lauch Zwiebel Gurke Tomate Salat Spinat Erbse Bohne Linse
  Mais Reis Nudel Suppe Braten Wurst Schinken Speck Steak Fleisch Pizza Kakao Kaffee Saft Wasser
  Wein Bier Sekt Most Sirup Soße Omelett Pudding Bonbon Müsli Brezel Zopf Semmel Gipfeli Rösti
  Fondue Hafer Gerste Roggen Weizen Hirse Minze Salbei Thymian Zimt Vanille Ingwer Kürbis Paprika
  Olive Kapern

  Haus Dach Wand Boden Decke Fenster Tür Treppe Keller Estrich Balkon Küche Stube Zimmer Dusche
  Wanne Spiegel Kamin Ofen Herd Tisch Stuhl Bank Sofa Sessel Bett Kissen Teppich Vorhang Lampe
  Kerze Regal Schrank Kiste Korb Truhe Topf Pfanne Teller Tasse Glas Becher Krug Kanne Gabel
  Messer Löffel Schale Deckel Besen Eimer Lappen Schwamm Seife Bürste Kamm Wecker Radio Klingel
  Schloss Riegel Garage Zaun Mauer Brunnen Hütte Scheune Stall Villa Burg Turm Kirche Kapelle
  Schule Laden Markt Brücke Straße Gasse Platz Pfad Tunnel

  Kopf Haar Stirn Auge Nase Mund Lippe Zahn Zunge Kinn Wange Hals Nacken Schulter Hand Finger
  Daumen Nagel Brust Bauch Rücken Hüfte Bein Knie Fuß Zehe Ferse Herz Lunge Leber Magen Niere
  Blut Haut Knochen Muskel Nerv Gehirn

  Hemd Hose Rock Kleid Jacke Mantel Weste Pulli Schal Mütze Kappe Socke Schuh Stiefel Sandale
  Gürtel Knopf Tasche Koffer Ring Kette Brille

  Ball Netz Ruder Segel Boot Kanu Kajak Mast Anker Regatta Steg Paddel Kiel Heck Deck Jolle Yacht
  Rennen Sieg Pokal Medaille Punkt Spiel Runde Satz Team Trainer Verein Kasse Beitrag Sitzung Feier
  Fest Party Ausflug Reise Zelt Lager Karte Kompass Tennis Golf Hockey Rugby Turnen Schlitten
  Rodel Loipe Piste

  Zeit Jahr Monat Woche Stunde Minute Sekunde Datum Termin Anfang Ende Mitte Grenze Ziel Plan Idee
  Frage Antwort Grund Sinn Wert Preis Geld Münze Schein Brief Paket Post Buch Seite Wort Text Lied
  Musik Bild Farbe Kunst Film Theater Oper Konzert Bühne Tanz Freude Glück Liebe Traum Hoffnung
  Angst Ruhe Stille Frieden Kraft Macht Recht Pflicht Arbeit Beruf Firma Chef Kunde Ware Handel
  Wagen Auto Bahn Tram Taxi Velo Motor Reifen Flug Flügel Pilot Kapitän Matrose Fahrer Bauer
  Bäcker Metzger Maler Lehrer Arzt Richter Koch Kellner Gärtner Förster Fischer Jäger Hirte König
  Prinz Ritter Zwerg Riese Hexe Drache Engel Geist Märchen Sage Rätsel Wunder Zauber Schatz Krone
  Thron Schwert Schild Pfeil Bogen Speer Helm Fahne Flagge Wappen Glocke Trommel Flöte Geige Harfe
  Orgel Gitarre Klavier Posaune Tuba Horn Pauke Note Takt Chor Stimme Melodie Silber Gold Kupfer
  Eisen Stahl Blech Zinn Blei Holz Papier Karton Leder Wolle Seide Samt Leinen Stoff Faden Nadel
  Schere Hammer Zange Säge Bohrer Schraube Dübel Leiter Seil Draht Rohr Schlauch Ventil Pumpe
  Kabel Stecker Schalter Handy Kamera Foto Album

  klein groß lang kurz breit schmal dick dünn hoch tief warm kalt heiß kühl nass feucht trocken
  hell dunkel laut leise schnell langsam schwer leicht stark schwach weich hart rund spitz glatt
  rau jung früh spät lieb nett froh traurig müde wach klug wild zahm frei fremd fern reich voll
  leer satt sauber bunt blass fein grob scharf stumpf süß sauer bitter salzig frisch reif grau
  blau grün gelb braun rosa lila schwarz weiß

  gehen laufen springen tanzen singen spielen lachen weinen lesen schreiben rechnen malen
  zeichnen kochen backen essen trinken schlafen träumen denken wissen lernen lehren fahren fliegen
  segeln rudern tauchen wandern klettern reiten werfen fangen treten ziehen drücken heben tragen
  bauen gießen ernten waschen putzen kaufen zahlen sparen leihen suchen finden fragen sagen
  rufen hören sehen riechen fühlen helfen danken grüßen feiern warten bleiben kommen reisen packen
  öffnen

  Bahnhof Dampfer Diamant Einhorn Fahrrad Feldweg Flasche Gemüse Kapitel Kloster Koralle Lampion
  Laterne Leopard Libelle Messing Nachbar Postamt Rathaus Seehund Sonntag Freitag Samstag Februar
  Oktober Sprache Strumpf Tochter Toaster Wachtel Walross Zeitung Hamster Pelikan Station Verkehr
  Heimweg Gewicht Schwung Stempel Uniform Violine Akrobat Schmied Seeufer Bergsee Kantine Pastete
  Ravioli Lasagne Risotto Polenta Gulasch Ketchup Oregano Kamille Traktor Hofhund Wohnung Zuhause
  Eingang Ausgang Gardine Polster Heilung Medizin Tombola Turnier Meister Anpfiff Abseits Torwart
  Stadion
`;

/** The pool as transcribed upper-case words, duplicates dropped, first occurrence wins. */
export function wordlePool(): string[] {
  return [...new Set(WORD_POOL.split(/\s+/).filter(Boolean).map(normalizeLetters))];
}

const byLength = new Map<number, readonly string[]>();

/**
 * The solution candidates of one length, in pool order. Computed once per length.
 * An unsupported length yields an empty list.
 */
export function wordleWords(length: number): readonly string[] {
  let words = byLength.get(length);
  if (!words) {
    words = (WORDLE_LENGTHS as readonly number[]).includes(length)
      ? wordlePool().filter(word => word.length === length)
      : [];
    byLength.set(length, words);
  }
  return words;
}

/** The raw pool, split — for the spec only (duplicate and spelling checks before transcription). */
export function rawWordlePool(): string[] {
  return WORD_POOL.split(/\s+/).filter(Boolean);
}
