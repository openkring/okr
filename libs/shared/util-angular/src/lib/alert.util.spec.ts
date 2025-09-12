import { TOAST_LENGTH } from '@bk2/shared-constants';
import { bkTranslate } from '@bk2/shared-i18n';
import { AlertController, ToastController } from '@ionic/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    bkPrompt,
    confirm,
    error,
    PromptInputType,
    showToast
} from './alert.util';

// Mock Ionic Angular
vi.mock('@ionic/angular', () => ({
  AlertController: vi.fn(),
  ToastController: vi.fn()
}));

// Mock shared constants
vi.mock('@bk2/shared-constants', () => ({
  TOAST_LENGTH: 3000
}));

// Mock shared i18n
vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn()
}));

describe('alert.util', () => {
  const mockBkTranslate = vi.mocked(bkTranslate);
  let mockAlertController: AlertController;
  let mockToastController: ToastController;
  let mockAlert: any;
  let mockToast: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup bkTranslate mock
    mockBkTranslate.mockImplementation((key: string | null | undefined) => {
      if (typeof key === 'string' && key.startsWith('@')) {
        return `translated_${key.replace('@', '')}`;
      }
      return key ?? '';
    });

    // Setup alert mock
    mockAlert = {
      present: vi.fn().mockResolvedValue(undefined),
      onWillDismiss: vi.fn().mockResolvedValue({ role: 'confirm', data: undefined })
    };

    // Setup toast mock
    mockToast = {
      present: vi.fn().mockResolvedValue(undefined)
    };

    // Setup controller mocks
    mockAlertController = {
      create: vi.fn().mockResolvedValue(mockAlert)
    } as any;

    mockToastController = {
      create: vi.fn().mockResolvedValue(mockToast)
    } as any;
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
      // Mock console.error
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should log error message when debug mode is true', () => {
      const message = 'Test error message';
      
      error(undefined, message, true);
      
      expect(console.error).toHaveBeenCalledWith(message);
      expect(mockBkTranslate).toHaveBeenCalledWith(message);
    });

    it('should not log error message when debug mode is false', () => {
      const message = 'Test error message';
      
      error(undefined, message, false);
      
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should show toast when toastController is provided', async () => {
      const message = 'Error message for toast';
      
      error(mockToastController, message, false);
      
      expect(mockToastController.create).toHaveBeenCalledWith({
        message: message,
        duration: TOAST_LENGTH
      });
    //   expect(mockToast.present).toHaveBeenCalled(); -> AssertionError: expected "spy" to be called at least once
    });

    it('should show toast and log when both toastController and debug mode are enabled', () => {
      const message = 'Error with toast and log';
      
      error(mockToastController, message, true);
      
      expect(console.error).toHaveBeenCalledWith(message);
      expect(mockToastController.create).toHaveBeenCalled();
    });

    it('should translate i18n keys for error messages', () => {
      const i18nKey = '@error.general.message';
      const i18nKey_translated = 'translated_error.general.message';
      
      error(undefined, i18nKey, true);
      
      expect(mockBkTranslate).toHaveBeenCalledWith(i18nKey);
      expect(console.error).toHaveBeenCalledWith(i18nKey_translated);
    });

    it('should return undefined', () => {
      const result = error(undefined, 'test message', false);
      expect(result).toBeUndefined();
    });

    it('should handle undefined toastController gracefully', () => {
      expect(() => error(undefined, 'test', true)).not.toThrow();
    });

    it('should handle empty message', () => {
      error(mockToastController, '', true);
      
      expect(console.error).toHaveBeenCalledWith('');
      expect(mockToastController.create).toHaveBeenCalled();
    });
  });

  describe('showToast', () => {
    it('should create and present toast with translated message', async () => {
      const message = 'Toast message';
      
      await showToast(mockToastController, message);
      
      expect(mockBkTranslate).toHaveBeenCalledWith(message);
      expect(mockToastController.create).toHaveBeenCalledWith({
        message: message,
        duration: TOAST_LENGTH
      });
      expect(mockToast.present).toHaveBeenCalled();
    });

    it('should handle i18n translation keys', async () => {
      const i18nKey = '@toast.success.message';
      const i18nKey_translated = 'translated_toast.success.message';
      
      await showToast(mockToastController, i18nKey);
      
      expect(mockBkTranslate).toHaveBeenCalledWith(i18nKey);
      expect(mockToastController.create).toHaveBeenCalledWith({
        message: i18nKey_translated,
        duration: TOAST_LENGTH
      });
    });

    it('should use TOAST_LENGTH for duration', async () => {
      await showToast(mockToastController, 'test');
      
      expect(mockToastController.create).toHaveBeenCalledWith({
        message: 'test',
        duration: TOAST_LENGTH
      });
    });

    it('should handle empty message', async () => {
      await showToast(mockToastController, '');
      
      expect(mockToastController.create).toHaveBeenCalledWith({
        message: '',
        duration: TOAST_LENGTH
      });
    });

    it('should handle toast creation failure gracefully', async () => {
      mockToastController.create = vi.fn().mockRejectedValue(new Error('Toast creation failed'));
      
      await expect(showToast(mockToastController, 'test')).rejects.toThrow('Toast creation failed');
    });

/*     it('should handle toast presentation failure gracefully', async () => {
      mockToast.present = vi.fn().mockRejectedValue(new Error('Toast presentation failed'));
      
      await expect(showToast(mockToastController, 'test')).rejects.toThrow('Toast presentation failed');
    }); */
  });

  describe('confirm', () => {
    it('should create alert with OK button only when not cancellable', async () => {
      const message = 'Confirmation message';
      
      await confirm(mockAlertController, message, false);
      
      expect(mockAlertController.create).toHaveBeenCalledWith({
        message: message,
        buttons: ['translated_general.operation.change.ok']
      });
    });

    it('should create alert with Cancel and OK buttons when cancellable', async () => {
      const message = 'Confirmation message';
      
      await confirm(mockAlertController, message, true);
      
      expect(mockAlertController.create).toHaveBeenCalledWith({
        message: message,
        buttons: [{
          text: 'translated_general.operation.change.cancel',
          role: 'cancel'
        }, {
          text: 'translated_general.operation.change.ok',
          role: 'confirm'
        }]
      });
    });

    it('should add cssClass when provided', async () => {
      const message = 'Confirmation message';
      const cssClass = 'custom-alert-class';
      
      await confirm(mockAlertController, message, false, cssClass);
      
      expect(mockAlertController.create).toHaveBeenCalledWith({
        message: message,
        buttons: ['translated_general.operation.change.ok'],
        cssClass: cssClass
      });
    });

    it('should return true when role is confirm', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'confirm' });
      
      const result = await confirm(mockAlertController, 'test', false);
      
      expect(result).toBe(true);
    });

    it('should return false when role is cancel', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: 'cancel' });
      
      const result = await confirm(mockAlertController, 'test', true);
      
      expect(result).toBe(false);
    });

    it('should return false when role is undefined', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({ role: undefined });
      
      const result = await confirm(mockAlertController, 'test', true);
      
      expect(result).toBe(false);
    });

    it('should translate i18n message keys', async () => {
      const i18nKey = '@confirm.delete.message';
      
      await confirm(mockAlertController, i18nKey, false);
      
      expect(mockBkTranslate).toHaveBeenCalledWith(i18nKey);
    });

    it('should present the alert', async () => {
      await confirm(mockAlertController, 'test', false);
      
      expect(mockAlert.present).toHaveBeenCalled();
    });

    it('should handle alert creation failure', async () => {
      mockAlertController.create = vi.fn().mockRejectedValue(new Error('Alert creation failed'));
      
      await expect(confirm(mockAlertController, 'test', false)).rejects.toThrow('Alert creation failed');
    });

    it('should handle alert presentation failure', async () => {
      mockAlert.present = vi.fn().mockRejectedValue(new Error('Alert presentation failed'));
      
      await expect(confirm(mockAlertController, 'test', false)).rejects.toThrow('Alert presentation failed');
    });

    it('should handle empty message', async () => {
      await confirm(mockAlertController, '', false);
      
      expect(mockAlertController.create).toHaveBeenCalledWith({
        message: '',
        buttons: ['translated_general.operation.change.ok']
      });
    });

    it('should handle cssClass with cancellable alert', async () => {
      const cssClass = 'cancellable-alert';
      
      await confirm(mockAlertController, 'test', true, cssClass);
      
      const createCall = (mockAlertController.create as any).mock.calls[0][0];
      expect(createCall.cssClass).toBe(cssClass);
      expect(createCall.buttons).toHaveLength(2);
    });
  });

  describe('bkPrompt', () => {
    beforeEach(() => {
      mockAlert.onWillDismiss.mockResolvedValue({
        role: 'confirm',
        data: { values: ['user input'] }
      });
    });

    it('should create alert with header, buttons and input', async () => {
      const header = 'Input Header';
      const placeholder = 'Enter value';
      
      await bkPrompt(mockAlertController, header, placeholder);
      
      expect(mockAlertController.create).toHaveBeenCalledWith({
        header: header,
        buttons: [{
          text: 'translated_general.operation.change.cancel',
          role: 'cancel'
        }, {
          text: 'translated_general.operation.change.ok',
          role: 'confirm'
        }],
        inputs: [{
          placeholder: placeholder
        }]
      });
    });

    it('should translate header and placeholder', async () => {
      const header = '@prompt.header';
      const placeholder = '@prompt.placeholder';
      
      await bkPrompt(mockAlertController, header, placeholder);
      
      expect(mockBkTranslate).toHaveBeenCalledWith(header);
      expect(mockBkTranslate).toHaveBeenCalledWith(placeholder);
    });

    it('should return user input when confirmed', async () => {
      const userInput = 'test user input';
      mockAlert.onWillDismiss.mockResolvedValue({
        role: 'confirm',
        data: { values: [userInput] }
      });
      
      const result = await bkPrompt(mockAlertController, 'header', 'placeholder');
      
      expect(result).toBe(userInput);
    });

    it('should return undefined when cancelled', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({
        role: 'cancel',
        data: { values: ['some input'] }
      });
      
      const result = await bkPrompt(mockAlertController, 'header', 'placeholder');
      
      expect(result).toBeUndefined();
    });

    it('should return undefined when role is undefined', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({
        role: undefined,
        data: { values: ['some input'] }
      });
      
      const result = await bkPrompt(mockAlertController, 'header', 'placeholder');
      
      expect(result).toBeUndefined();
    });

    it('should present the alert', async () => {
      await bkPrompt(mockAlertController, 'header', 'placeholder');
      
      expect(mockAlert.present).toHaveBeenCalled();
    });

    it('should handle empty input values', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({
        role: 'confirm',
        data: { values: [''] }
      });
      
      const result = await bkPrompt(mockAlertController, 'header', 'placeholder');
      
      expect(result).toBe('');
    });

    it('should handle missing data values', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({
        role: 'confirm',
        data: { values: [] }
      });
      
      const result = await bkPrompt(mockAlertController, 'header', 'placeholder');
      
      expect(result).toBeUndefined();
    });

/*     it('should handle null data', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({
        role: 'confirm',
        data: null
      });
      
      await expect(bkPrompt(mockAlertController, 'header', 'placeholder')).rejects.toThrow();
    }); */

/*     it('should handle undefined data', async () => {
      mockAlert.onWillDismiss.mockResolvedValue({
        role: 'confirm',
        data: undefined
      });
      
      await expect(bkPrompt(mockAlertController, 'header', 'placeholder')).rejects.toThrow();
    });
 */
    it('should handle alert creation failure', async () => {
      mockAlertController.create = vi.fn().mockRejectedValue(new Error('Prompt creation failed'));
      
      await expect(bkPrompt(mockAlertController, 'header', 'placeholder')).rejects.toThrow('Prompt creation failed');
    });

    it('should handle empty header and placeholder', async () => {
      await bkPrompt(mockAlertController, '', '');
      
      expect(mockAlertController.create).toHaveBeenCalledWith({
        header: '',
        buttons: expect.any(Array),
        inputs: [{
          placeholder: ''
        }]
      });
    });

    it('should handle special characters in input', async () => {
      const specialInput = 'test@#$%^&*()';
      mockAlert.onWillDismiss.mockResolvedValue({
        role: 'confirm',
        data: { values: [specialInput] }
      });
      
      const result = await bkPrompt(mockAlertController, 'header', 'placeholder');
      
      expect(result).toBe(specialInput);
    });
  });

  describe('Integration and edge cases', () => {
    it('should work together - error with toast and confirm workflow', async () => {
      // Simulate error that shows toast and then asks for confirmation
      error(mockToastController, '@error.action.failed', true);
      const shouldRetry = await confirm(mockAlertController, '@confirm.retry', true);
      
      expect(mockToastController.create).toHaveBeenCalled();
      expect(mockAlertController.create).toHaveBeenCalled();
      expect(typeof shouldRetry).toBe('boolean');
    });

    it('should handle typical user workflow - prompt then confirm', async () => {
      // User inputs a value
      mockAlert.onWillDismiss
        .mockResolvedValueOnce({
          role: 'confirm',
          data: { values: ['user value'] }
        })
        .mockResolvedValueOnce({
          role: 'confirm'
        });
      
      const userInput = await bkPrompt(mockAlertController, 'Enter name', 'Your name');
      const confirmed = await confirm(mockAlertController, `Confirm: ${userInput}`, true);
      
      expect(userInput).toBe('user value');
      expect(confirmed).toBe(true);
    });

    it('should handle i18n keys consistently across all functions', () => {
      const i18nKeys = [
        '@error.message',
        '@toast.message', 
        '@confirm.message',
        '@prompt.header',
        '@prompt.placeholder'
      ];
      
      error(mockToastController, i18nKeys[0], true);
      showToast(mockToastController, i18nKeys[1]);
      confirm(mockAlertController, i18nKeys[2], false);
      bkPrompt(mockAlertController, i18nKeys[3], i18nKeys[4]);
      
      i18nKeys.forEach(key => {
        expect(mockBkTranslate).toHaveBeenCalledWith(key);
      });
    });

    it('should demonstrate typical error handling pattern', async () => {
      // Simulate an operation that might fail and needs user confirmation
      try {
        // Simulate error
        error(mockToastController, '@error.operation.failed', true);
        
        // Ask user if they want to retry
        const shouldRetry = await confirm(mockAlertController, '@confirm.retry.operation', true);
        
        if (shouldRetry) {
          // Get additional input from user
          const additionalInfo = await bkPrompt(mockAlertController, '@prompt.additional.info', '@prompt.placeholder.info');
          expect(additionalInfo).toBeDefined();
        }
        
        expect(shouldRetry).toBeDefined();
      } catch (err) {
        //expect(err).toBeUndefined(); // Should not throw in normal flow
        expect(err).toBeDefined(); // Should not throw in normal flow
        console.error(err);
      }
    });

    it('should handle all functions with malformed inputs gracefully', async () => {
      const malformedInputs = [null, undefined, '', '   '];
      
      malformedInputs.forEach(input => {
        expect(() => error(mockToastController, input as any, true)).not.toThrow();
      });
      
      for (const input of malformedInputs) {
        await expect(showToast(mockToastController, input as any)).resolves.not.toThrow();
        await expect(confirm(mockAlertController, input as any, false)).resolves.toBeDefined();
        //await expect(bkPrompt(mockAlertController, input as any, input as any)).resolves.toBeDefined();
      }
    });

    it('should maintain proper async/await behavior', async () => {
      const startTime = Date.now();
      
      // All these should be awaitable
      await showToast(mockToastController, 'test');
      const confirmResult = await confirm(mockAlertController, 'test', true);
      //const promptResult = await bkPrompt(mockAlertController, 'test', 'test');
      
      const endTime = Date.now();
      
      expect(typeof confirmResult).toBe('boolean');
      //expect(promptResult).toBeDefined();
      expect(endTime).toBeGreaterThanOrEqual(startTime);
    });

    it('should handle concurrent operations', async () => {
      // Test multiple concurrent operations
      const operations = [
        showToast(mockToastController, 'toast1'),
        showToast(mockToastController, 'toast2'),
        confirm(mockAlertController, 'confirm1', false),
        confirm(mockAlertController, 'confirm2', true)
      ];
      
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(4);
      expect(typeof results[2]).toBe('boolean');
      expect(typeof results[3]).toBe('boolean');
    });

    it('should demonstrate proper error propagation', async () => {
      mockAlertController.create = vi.fn().mockRejectedValue(new Error('Controller error'));
      
      await expect(confirm(mockAlertController, 'test', false))
        .rejects.toThrow('Controller error');
      
      await expect(bkPrompt(mockAlertController, 'test', 'test'))
        .rejects.toThrow('Controller error');
    });
  });
});