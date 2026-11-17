import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ENV } from '@okr/shared-config';
import { AlertService } from '@okr/shared-util-angular';

import { GeocodingService } from './geocode.service';

describe('GeocodingService', () => {
  let service: GeocodingService;
  let httpMock: HttpTestingController;
  const alert = { error: vi.fn() };
  let consoleSpy: ReturnType<typeof vi.spyOn>[];

  beforeEach(() => {
    alert.error.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alert },
        { provide: ENV, useValue: { services: { gmapKey: 'k' } } }
      ]
    });
    service = TestBed.inject(GeocodingService);
    httpMock = TestBed.inject(HttpTestingController);
    consoleSpy = [vi.spyOn(console, 'error'), vi.spyOn(console, 'log'), vi.spyOn(console, 'warn')];
  });

  afterEach(() => {
    httpMock.verify();
    consoleSpy.forEach(s => s.mockRestore());
  });

  const flush = (body: object) => httpMock.expectOne(r => r.url.includes('geocode')).flush(body);

  describe('geocodeQuiet', () => {
    it('returns undefined without alert or console output on ZERO_RESULTS', async () => {
      const p = service.geocodeQuiet('Seestrasse 1, Zürich');
      flush({ status: 'ZERO_RESULTS', results: [] });
      expect(await p).toBeUndefined();
      expect(alert.error).not.toHaveBeenCalled();
      consoleSpy.forEach(s => expect(s).not.toHaveBeenCalled());
    });

    it('returns lat/lng for one result', async () => {
      const p = service.geocodeQuiet('Seestrasse 1, Zürich');
      flush({ status: 'OK', results: [{ geometry: { location: { lat: 47.3, lng: 8.5 } } }] });
      expect(await p).toEqual({ lat: 47.3, lng: 8.5 });
    });

    it('returns undefined without alert or console output on HTTP error', async () => {
      const p = service.geocodeQuiet('Seestrasse 1, Zürich');
      httpMock.expectOne(r => r.url.includes('geocode')).flush('x', { status: 500, statusText: 'err' });
      expect(await p).toBeUndefined();
      expect(alert.error).not.toHaveBeenCalled();
      consoleSpy.forEach(s => expect(s).not.toHaveBeenCalled());
    });

    it('returns undefined for an empty string without a request', async () => {
      expect(await service.geocodeQuiet('')).toBeUndefined();
    });
  });

  describe('geocodeAddress', () => {
    it('alerts when nothing is found', async () => {
      const p = service.geocodeAddress('Nowhere');
      flush({ status: 'ZERO_RESULTS', results: [] });
      expect(await p).toBeUndefined();
      expect(alert.error).toHaveBeenCalledWith('Address not found');
    });

    it('alerts on HTTP error', async () => {
      const p = service.geocodeAddress('Nowhere');
      httpMock.expectOne(r => r.url.includes('geocode')).flush('x', { status: 500, statusText: 'err' });
      expect(await p).toBeUndefined();
      expect(alert.error).toHaveBeenCalledTimes(1);
    });

    it('returns coordinates on success', async () => {
      const p = service.geocodeAddress('Seestrasse 1');
      flush({ status: 'OK', results: [{ geometry: { location: { lat: 1, lng: 2 } } }] });
      expect(await p).toEqual({ lat: 1, lng: 2 });
      expect(alert.error).not.toHaveBeenCalled();
    });
  });
});
