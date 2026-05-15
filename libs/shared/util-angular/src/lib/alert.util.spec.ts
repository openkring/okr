import { TranslocoService } from '@jsverse/transloco';
import { TOAST_LENGTH } from '@bk2/shared-constants';
import { AlertController, ToastController } from '@ionic/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bkPrompt, confirm, error, initAlertTranslation, PromptInputType, showToast } from './alert.util';

vi.mock('@ionic/angular', () => ({
  AlertController: vi.fn(),
  ToastController: vi.fn()
}));

vi.mock('@bk2/shared-constants', () => ({
  TOAST_LENGTH: 3000
}));

describe('alert.util', () => {
  let mockAlertController: AlertController;
  let mockToastController: ToastController;
  let mockAlert: any;
  let mockToast: any;
  let mockTransloco: TranslocoService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockTransloco = {
      translate: vi.fn((key: string) => `[${key}]`)
    } as any;
    initAlertTranslation(mockTransloco);

    mockAlert = {
      present: vi.fn().mockResolvedValue(undefined),
      onWillDismiss: vi.fn().mockResolvedValue({ role: 'confirm', data: undefined })
    };
    mockToast = { present: vi.fn().mockResolvedValue(undefined) };
    mockAlertController = { create: vi.fn().mockResolvedValue(mockAlert) } as any;
    mockToastController = { create: vi.fn().mockResolvedValue(mockToast) } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PromptInputType', () => {
    it('should export correct input types', () => {
      const inputTypes: PromptInputType[] = ['text', 'number', 'password'];
      expect(inputTypes).toContain('text');
      expect(inputTypes).toContain('number');
      expect(inputTypes).toContain('password');
    });
  });

  describe('error', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should log translated message in debug mode', () => {
      error(undefined, '@error.general', true);
      expect(mockTransloco.translate).toHaveBeenCalledWith('error.general');
      expect(console.error).toHaveBeenCalledWith('[error.general]');
    });

    it('should not log when debug mode is false', () => {
      error(undefined, 'message', false);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should show toast when toastController is provided', () => {
      error(mockToastController, 'Error', false);
      expect(mockToastController.create).toHaveBeenCalled();
    });

    it('should return undefined', () => {
      expect(error(undefined, 'test', false)).toBeUndefined();
    });

    it('should pass plain strings through without translation', () => {
      error(undefined, 'plain text', true);
      expect(console.error).toHaveBeenCalledWith('plain text');
    });
  });

  describe('showToast', () => {
    it('should create toast with translated @key message', async () => {
      await showToast(mockToastController, '@toast.success');
      expect(mockTransloco.translate).toHaveBeenCalledWith('toast.success');
      expect(mockToastController.create).toHaveBeenCalledWith({
        message: '[toast.success]',
        duration: TOAST_LENGTH
      });
      expect(mockToast.present).toHaveBeenCalled();
    });

    it('should pass plain string through without translating', async () => {
      await showToast(mockToastController, 'plain text');
      expect(mockToastController.create).toHaveBeenCalledWith({
        message: 'plain text',
        duration: TOAST_LENGTH
      });
    });

    it('should reject on controller failure', async () => {
      mockToastController.create = vi.fn().mockRejectedValue(new Error('fail'));
      await expect(showToast(mockToastController, 'test')).rejects.toThrow('fail');
    });
  });

  describe('confirm', () => {
    it('should create non-cancellable alert with provided okLabel', async () => {
      await confirm(mockAlertController, 'Are you sure?', 'OK', 'Cancel', false);
      expect(mockAlertController.create).toHaveBeenCalledWith({
        message: 'Are you sure?',
        buttons: ['OK']
      });
    });

    it('should create cancellable alert with both labels', async () => {
      await confirm(mockAlertController, 'Delete?', 'Yes', 'No', true);
      expect(mockAlertController.create).toHaveBeenCalledWith({
        message: 'Delete?',
        buttons: [
          { text: 'No', role: 'cancel' },
          { text: 'Yes', role: 'confirm' }
        ]
      });
    });

    it('should include cssClass when provided', async () => {
      await confirm(mockAlertController, 'msg', 'OK', 'Cancel', false, 'my-class');
      expect(mockAlertController.create).toHaveBeenCalledWith({
        message: 'msg',
        buttons: ['OK'],
        cssClass: 'my-class'
      });
    });

    it('should return true when dismissed with confirm role', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'confirm' });
      expect(await confirm(mockAlertController, 'msg', 'OK', 'Cancel', true)).toBe(true);
    });

    it('should return false when dismissed with cancel role', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'cancel' });
      expect(await confirm(mockAlertController, 'msg', 'OK', 'Cancel', true)).toBe(false);
    });

    it('should return false when role is undefined', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: undefined });
      expect(await confirm(mockAlertController, 'msg', 'OK', 'Cancel', true)).toBe(false);
    });

    it('should present the alert', async () => {
      await confirm(mockAlertController, 'test', 'OK', 'Cancel', false);
      expect(mockAlert.present).toHaveBeenCalled();
    });

    it('should reject on controller failure', async () => {
      mockAlertController.create = vi.fn().mockRejectedValue(new Error('fail'));
      await expect(confirm(mockAlertController, 'test', 'OK', 'Cancel', false)).rejects.toThrow('fail');
    });
  });

  describe('bkPrompt', () => {
    beforeEach(() => {
      mockAlert.onWillDismiss.mockResolvedValue({
        role: 'confirm',
        data: { values: ['user input'] }
      });
    });

    it('should create alert with header, okLabel, cancelLabel and textarea input', async () => {
      await bkPrompt(mockAlertController, 'Header', 'Placeholder', 'OK', 'Cancel');
      expect(mockAlertController.create).toHaveBeenCalledWith({
        header: 'Header',
        cssClass: 'bk-prompt-alert',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'OK', role: 'confirm' }
        ],
        inputs: [{ type: 'textarea', placeholder: 'Placeholder', value: undefined }]
      });
    });

    it('should pass value when provided', async () => {
      await bkPrompt(mockAlertController, 'H', 'P', 'OK', 'Cancel', 'existing');
      const call = (mockAlertController.create as any).mock.calls[0][0];
      expect(call.inputs[0].value).toBe('existing');
    });

    it('should return user input when confirmed', async () => {
      expect(await bkPrompt(mockAlertController, 'H', 'P', 'OK', 'Cancel')).toBe('user input');
    });

    it('should return undefined when cancelled', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'cancel', data: { values: ['x'] } });
      expect(await bkPrompt(mockAlertController, 'H', 'P', 'OK', 'Cancel')).toBeUndefined();
    });

    it('should return undefined for empty values array', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'confirm', data: { values: [] } });
      expect(await bkPrompt(mockAlertController, 'H', 'P', 'OK', 'Cancel')).toBeUndefined();
    });
  });
});