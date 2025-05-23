import { GeoPosition } from "@bk2/shared/models";
import { Position, Geolocation } from "@capacitor/geolocation";
import { AlertController, Platform } from "@ionic/angular/standalone";
/**
 * A KMZ file is essentially a ZIP archive containing one or more KML files (xml), along with optional media files such as images or models. 
 * The root KML file within the ZIP is typically named `doc.kml`.
 * KMZ files can be opened with Google Earth and other GIS Tools, e.g. QGIS, ArcGIS, etc.
 * @param positions an array of capacitor/Geolocation Positions
 * @returns a string representing the KMZ file
 */
export function convertToKml(positions: Position[]): string {
  const kml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    '    <name>Geolocation Positions</name>',
    '    <description>Converted from Position array</description>'
  ];

  positions.forEach((position, index) => {
    kml.push(`    <Placemark>`);
    kml.push(`      <name>Position ${index + 1}</name>`);
    kml.push(`      <Point>`);
    kml.push(`        <coordinates>${position.coords.longitude},${position.coords.latitude}</coordinates>`); 
    kml.push(`      </Point>`);
    kml.push(`    </Placemark>`);
  });

  kml.push('  </Document>');
  kml.push('</kml>');

  return kml.join('\n');
}

export function lookupAddress(latitude?: number, longitude?: number): string {
  if (!latitude || !longitude) return 'unknown address';
  return 'not yet implemented';
}

export async function getCurrentPosition(): Promise<GeoPosition> {
  const _coord = await Geolocation.getCurrentPosition();
  return {
      latitude: _coord.coords.latitude,
      longitude: _coord.coords.longitude,
      altitude: _coord.coords.altitude ? _coord.coords.altitude : undefined,
      speed: _coord.coords.speed ? _coord.coords.speed : undefined,
      heading: _coord.coords.heading ? _coord.coords.heading : undefined
  }
}

export function canShowPosition(platform: Platform): boolean {
  if (platform.is('cordova')) {
    return true;
  } else {
    return false;
  }
}

// Cloud Functions
// tbd: convert coordinates to what3words
// tbd: convert what3words to coordinates
// tbd: convert coordinates to address
// tbd: convert address to coordinates
// tbd: convert what3words to address
// tbd: convert address to what3words
// tbd: convert coordinates to placeid
// tbd: convert placeid to coordinates


/*
for geocoding, reverse-geocoding and tracking examples:
https://medium.com/enappd/use-geolocation-geocoding-and-reverse-geocoding-in-ionic-capacitor-b494264f0e85

wahrscheinlich eine neue lib machen mit möglichst wenig Abhängigkeiten

geo
- geo.util
- geo.service
- Map Pages für Kartendarstellung und Tracking
- längerfristig mit verschiedenen Geo-Providern (Google, Apple, OpenStreetmap)
*/


// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function showAddress(alertController: AlertController, address: string): void {

  /*
  this.loading = await this.loadingCtrl.create({
    message: 'Please wait...',
    translucent: true,
    animated: true
  });
  await this.loading.present();
  */
//    this.map.clear();

  // Address -> latitude,longitude
/*     Geocoder.geocode({
    'address': address
  })
  .then((results: GeocoderResult[]) => {
    this.loading.dismiss();

    const _marker: Marker = this.map.addMarkerSync({
      'position': results[0].position,
      'title':  JSON.stringify(results[0].position)
    });
    this.map.animateCamera({
      'target': _marker.getPosition(),
      'zoom': 17
    }).then(() => {
      _marker.showInfoWindow();
    });
  }); */
}

export enum DirectionFormat {
  Abbreviation,
  Name
}

export function getDirectionFromAzimuth(degrees: number, format = DirectionFormat.Abbreviation): string {
  if (degrees < 23) return format === DirectionFormat.Abbreviation ? 'N' : 'Nord';
  if (degrees < 68) return format === DirectionFormat.Abbreviation ?  'NE' : 'Nordost';
  if (degrees < 113) return format === DirectionFormat.Abbreviation ?  'E' : 'Ost';
  if (degrees < 158) return format === DirectionFormat.Abbreviation ?  'SE' : 'Südost';
  if (degrees < 203) return format === DirectionFormat.Abbreviation ?  'S' : 'Süd';
  if (degrees < 248) return format === DirectionFormat.Abbreviation ?  'SW' : 'Südwest';
  if (degrees < 293) return format === DirectionFormat.Abbreviation ?  'W' : 'West';
  if (degrees < 338) return format === DirectionFormat.Abbreviation ?  'NW' : 'Nordwest';
  return format === DirectionFormat.Abbreviation ? 'N' : 'Nord';
}