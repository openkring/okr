import { signal } from '@angular/core';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock Angular's inject and all Angular DI before importing the service
vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();
  return {
    ...actual,
    inject: vi.fn(),
  };
});

vi.mock('@ionic/angular/standalone', () => ({
  AlertController: class AlertController {},
  ToastController: class ToastController {},
}));

vi.mock('@jsverse/transloco', () => ({
  TranslocoService: class TranslocoService {},
}));

vi.mock('@bk2/shared-i18n', () => ({
  I18nService: class I18nService {},
}));

vi.mock('./alert.util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./alert.util')>();
  return {
    ...actual,
    initAlertTranslation: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true),
    bkPrompt: vi.fn().mockResolvedValue('typed'),
    error: vi.fn().mockReturnValue(undefined),
  };
});

import { inject } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { TranslocoService } from '@jsverse/transloco';
import { I18nService } from '@bk2/shared-i18n';
import { initAlertTranslation, confirm, bkPrompt, showToast, error } from './alert.util';
import { AlertService } from './alert.service';

describe('AlertService', () => {
  let service: AlertService;
  const mockAlertController = { create: vi.fn() };
  const mockToast = { present: vi.fn() };
  const mockToastController = { create: vi.fn().mockResolvedValue(mockToast) };
  const mockTransloco = { translate: vi.fn((k: string) => k) };
  const mockOkSignal = signal('OK');
  const mockCancelSignal = signal('Abbrechen');
  const mockI18n = { ok: mockOkSignal, cancel: mockCancelSignal };
  const mockI18nService = {
    translateAll: vi.fn().mockReturnValue(mockI18n)
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (mockToastController.create as any).mockResolvedValue(mockToast);
    (mockToast.present as any).mockReset();
    (inject as any).mockImplementation((token: unknown) => {
      if (token === AlertController) return mockAlertController;
      if (token === ToastController) return mockToastController;
      if (token === TranslocoService) return mockTransloco;
      if (token === I18nService) return mockI18nService;
      return undefined;
    });
    (mockI18nService.translateAll as any).mockReturnValue(mockI18n);
    service = new AlertService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should call initAlertTranslation with TranslocoService', () => {
      expect(initAlertTranslation).toHaveBeenCalledWith(mockTransloco);
    });

    it('should call i18n.translateAll with ok and cancel keys', () => {
      expect(mockI18nService.translateAll).toHaveBeenCalledWith({
        ok: '@ok',
        cancel: '@cancel',
      });
    });
  });

  describe('confirm', () => {
    it('should delegate to confirm util with correct arguments', async () => {
      (confirm as any).mockResolvedValue(true);
      const result = await service.confirm('Delete item?', true);
      expect(confirm).toHaveBeenCalledWith(
        mockAlertController,
        'Delete item?',
        'OK',
        'Abbrechen',
        true,
        undefined
      );
      expect(result).toBe(true);
    });

    it('should return false when confirm util returns false', async () => {
      (confirm as any).mockResolvedValue(false);
      expect(await service.confirm('msg', true)).toBe(false);
    });

    it('should pass cssClass to confirm util', async () => {
      await service.confirm('msg', false, 'my-class');
      expect(confirm).toHaveBeenCalledWith(
        mockAlertController, 'msg', 'OK', 'Abbrechen', false, 'my-class'
      );
    });
  });

  describe('bkPrompt', () => {
    it('should delegate to bkPrompt util with correct arguments', async () => {
      (bkPrompt as any).mockResolvedValue('typed');
      const result = await service.bkPrompt('Enter name', 'Your name');
      expect(bkPrompt).toHaveBeenCalledWith(
        mockAlertController,
        'Enter name',
        'Your name',
        'OK',
        'Abbrechen',
        undefined
      );
      expect(result).toBe('typed');
    });

    it('should return undefined when bkPrompt util returns undefined', async () => {
      (bkPrompt as any).mockResolvedValue(undefined);
      expect(await service.bkPrompt('h', 'p')).toBeUndefined();
    });

    it('should pass value to bkPrompt util', async () => {
      await service.bkPrompt('header', 'placeholder', 'existing');
      expect(bkPrompt).toHaveBeenCalledWith(
        mockAlertController, 'header', 'placeholder', 'OK', 'Abbrechen', 'existing'
      );
    });
  });

  describe('showToast', () => {
    it('should create toast with the provided message', async () => {
      await service.showToast('Saved');
      expect(mockToastController.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Saved' })
      );
      expect(mockToast.present).toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should return undefined', () => {
      (error as any).mockReturnValue(undefined);
      expect(service.error('oops')).toBeUndefined();
    });

    it('should call error util with message and default isDebugMode=false', () => {
      service.error('oops');
      expect(error).toHaveBeenCalledWith(mockToastController, 'oops', false);
    });

    it('should pass isDebugMode=true to error util', () => {
      service.error('oops', true);
      expect(error).toHaveBeenCalledWith(mockToastController, 'oops', true);
    });
  });
});
