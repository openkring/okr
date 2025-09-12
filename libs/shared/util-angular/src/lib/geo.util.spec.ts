import { Geolocation } from '@capacitor/geolocation';
import { AlertController, Platform } from '@ionic/angular/standalone';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canShowPosition, convertToKml, DirectionFormat, getCurrentPosition, getDirectionFromAzimuth, lookupAddress, showAddress } from './geo.util';

// Mock Capacitor Geolocation
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    getCurrentPosition: vi.fn()
  }
}));

describe('geo.util', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('convertToKml', () => {
    it('should convert positions to KML string', () => {
      const positions = [
        { coords: { latitude: 1, longitude: 2 } } as any,
        { coords: { latitude: 3, longitude: 4 } } as any
      ];
      const kml = convertToKml(positions);
      expect(kml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
      expect(kml).toContain('<name>Position 1</name>');
      expect(kml).toContain('<coordinates>2,1</coordinates>');
      expect(kml).toContain('<name>Position 2</name>');
      expect(kml).toContain('<coordinates>4,3</coordinates>');
      expect(kml).toContain('</kml>');
    });

    it('should handle empty positions array', () => {
      const kml = convertToKml([]);
      expect(kml).toContain('<Document>');
      expect(kml).toContain('</Document>');
    });
  });

  describe('lookupAddress', () => {
    it('should return "unknown address" if latitude or longitude is missing', () => {
      expect(lookupAddress(undefined, 10)).toBe('unknown address');
      expect(lookupAddress(10, undefined)).toBe('unknown address');
      expect(lookupAddress(undefined, undefined)).toBe('unknown address');
    });

    it('should return "not yet implemented" if both latitude and longitude are provided', () => {
      expect(lookupAddress(10, 20)).toBe('not yet implemented');
    });
  });

  describe('getCurrentPosition', () => {
    it('should return GeoPosition from Geolocation', async () => {
      const mockCoords = {
        latitude: 10,
        longitude: 20,
        altitude: 100,
        speed: 5,
        heading: 90
      };
      (Geolocation.getCurrentPosition as any).mockResolvedValue({ coords: mockCoords });

      const result = await getCurrentPosition();
      expect(result).toEqual({
        latitude: 10,
        longitude: 20,
        altitude: 100,
        speed: 5,
        heading: 90
      });
    });

    it('should handle missing optional fields', async () => {
      const mockCoords = {
        latitude: 10,
        longitude: 20
      };
      (Geolocation.getCurrentPosition as any).mockResolvedValue({ coords: mockCoords });

      const result = await getCurrentPosition();
      expect(result).toEqual({
        latitude: 10,
        longitude: 20,
        altitude: undefined,
        speed: undefined,
        heading: undefined
      });
    });
  });

  describe('canShowPosition', () => {
    it('should return true if platform is cordova', () => {
      const mockPlatform = { is: vi.fn((type) => type === 'cordova') } as unknown as Platform;
      expect(canShowPosition(mockPlatform)).toBe(true);
    });

    it('should return false if platform is not cordova', () => {
      const mockPlatform = { is: vi.fn(() => false) } as unknown as Platform;
      expect(canShowPosition(mockPlatform)).toBe(false);
    });
  });

  describe('showAddress', () => {
    it('should not throw when called', () => {
      const mockAlertController = {} as AlertController;
      expect(() => showAddress(mockAlertController, 'Test Address')).not.toThrow();
    });
  });

  describe('getDirectionFromAzimuth', () => {
    it('should return correct abbreviation for azimuth', () => {
      expect(getDirectionFromAzimuth(0)).toBe('N');
      expect(getDirectionFromAzimuth(45)).toBe('NE');
      expect(getDirectionFromAzimuth(90)).toBe('E');
      expect(getDirectionFromAzimuth(135)).toBe('SE');
      expect(getDirectionFromAzimuth(180)).toBe('S');
      expect(getDirectionFromAzimuth(225)).toBe('SW');
      expect(getDirectionFromAzimuth(270)).toBe('W');
      expect(getDirectionFromAzimuth(315)).toBe('NW');
      expect(getDirectionFromAzimuth(360)).toBe('N');
    });

    it('should return correct name for azimuth', () => {
      expect(getDirectionFromAzimuth(0, DirectionFormat.Name)).toBe('Nord');
      expect(getDirectionFromAzimuth(45, DirectionFormat.Name)).toBe('Nordost');
      expect(getDirectionFromAzimuth(90, DirectionFormat.Name)).toBe('Ost');
      expect(getDirectionFromAzimuth(135, DirectionFormat.Name)).toBe('Südost');
      expect(getDirectionFromAzimuth(180, DirectionFormat.Name)).toBe('Süd');
      expect(getDirectionFromAzimuth(225, DirectionFormat.Name)).toBe('Südwest');
      expect(getDirectionFromAzimuth(270, DirectionFormat.Name)).toBe('West');
      expect(getDirectionFromAzimuth(315, DirectionFormat.Name)).toBe('Nordwest');
      expect(getDirectionFromAzimuth(360, DirectionFormat.Name)).toBe('Nord');
    });

    it('should handle boundary values', () => {
      expect(getDirectionFromAzimuth(22.9)).toBe('N');
      expect(getDirectionFromAzimuth(23)).toBe('NE');
      expect(getDirectionFromAzimuth(67.9)).toBe('NE');
      expect(getDirectionFromAzimuth(68)).toBe('E');
      expect(getDirectionFromAzimuth(112.9)).toBe('E');
      expect(getDirectionFromAzimuth(113)).toBe('SE');
      expect(getDirectionFromAzimuth(157.9)).toBe('SE');
      expect(getDirectionFromAzimuth(158)).toBe('S');
      expect(getDirectionFromAzimuth(202.9)).toBe('S');
      expect(getDirectionFromAzimuth(203)).toBe('SW');
      expect(getDirectionFromAzimuth(247.9)).toBe('SW');
      expect(getDirectionFromAzimuth(248)).toBe('W');
      expect(getDirectionFromAzimuth(292.9)).toBe('W');
      expect(getDirectionFromAzimuth(293)).toBe('NW');
      expect(getDirectionFromAzimuth(337.9)).toBe('NW');
      expect(getDirectionFromAzimuth(338)).toBe('N');
    });

    it('should handle negative and large values', () => {
      expect(getDirectionFromAzimuth(-10)).toBe('N');
      expect(getDirectionFromAzimuth(720)).toBe('N');
    });
  });
});