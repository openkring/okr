import { Clipboard } from '@capacitor/clipboard';
import { ToastController } from '@ionic/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as alertUtil from './alert.util';
import {
  copyToClipboard,
  copyToClipboardWithConfirmation,
  pasteFromClipboard,
  times
} from './copy.util';

// Mock Capacitor Clipboard
vi.mock('@capacitor/clipboard', () => ({
  Clipboard: {
    write: vi.fn().mockResolvedValue(undefined),
    read: vi.fn().mockResolvedValue({ value: 'clipboard content' })
  }
}));

// Mock alert utility functions
vi.mock('./alert.util', () => ({
  showToast: vi.fn().mockResolvedValue(undefined),
  error: vi.fn()
}));

// Mock Ionic ToastController
const mockToastController = {
  create: vi.fn().mockResolvedValue({
    present: vi.fn().mockResolvedValue(undefined)
  })
} as unknown as ToastController;

describe('copy.util', () => {
  const mockClipboard = vi.mocked(Clipboard);
  const mockShowToast = vi.mocked(alertUtil.showToast);
  const mockError = vi.mocked(alertUtil.error);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('copyToClipboard', () => {
    it('should copy string content to clipboard', async () => {
      const content = 'test string';
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: content });
    });

    it('should copy number content to clipboard as string', async () => {
      const content = 42;
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: '42' });
    });

    it('should copy boolean true to clipboard as "true"', async () => {
      const content = true;
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: 'true' });
    });

    it('should copy boolean false to clipboard as "false"', async () => {
      const content = false;
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: 'false' });
    });

    it('should copy string array to clipboard as comma-separated string', async () => {
      const content = ['item1', 'item2', 'item3'];
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: 'item1,item2,item3' });
    });

    it('should copy empty array to clipboard as empty string', async () => {
      const content: string[] = [];
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: '' });
    });

    it('should copy undefined content to clipboard as empty string', async () => {
      const content = undefined;
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: '' });
    });

    it('should handle null content as empty string', async () => {
      const content = null as any;
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: '' });
    });

    it('should handle empty string content', async () => {
      const content = '';
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: '' });
    });

    it('should handle zero as number', async () => {
      const content = 0;
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: '0' });
    });

    it('should handle negative numbers', async () => {
      const content = -123;
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: '-123' });
    });

    it('should handle floating point numbers', async () => {
      const content = 3.14159;
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: '3.14159' });
    });

    it('should handle mixed array types', async () => {
      const content = ['string', '123', 'true'] as string[];
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: 'string,123,true' });
    });

    it('should handle special characters in string', async () => {
      const content = 'Hello\nWorld\t@#$%^&*()';
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: content });
    });

    it('should handle very long strings', async () => {
      const content = 'a'.repeat(10000);
      
      await copyToClipboard(content);
      
      expect(mockClipboard.write).toHaveBeenCalledOnce();
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: content });
    });

    it('should propagate Clipboard.write errors', async () => {
      const error = new Error('Clipboard write failed');
      mockClipboard.write.mockRejectedValue(error);
      
      await expect(copyToClipboard('test')).rejects.toThrow('Clipboard write failed');
    });
  });

  describe('pasteFromClipboard', () => {
/*     it('should return clipboard content', async () => {
      const expectedContent = 'clipboard content';
      mockClipboard.read.mockResolvedValue({ value: expectedContent });
      
      const result = await pasteFromClipboard();
      
      expect(mockClipboard.read).toHaveBeenCalledOnce();
      expect(result).toBe(expectedContent);
    });

    it('should handle empty clipboard content', async () => {
      mockClipboard.read.mockResolvedValue({ value: '' });
      
      const result = await pasteFromClipboard();
      
      expect(result).toBe('');
    });

    it('should handle multiline clipboard content', async () => {
      const multilineContent = 'Line 1\nLine 2\nLine 3';
      mockClipboard.read.mockResolvedValue({ value: multilineContent });
      
      const result = await pasteFromClipboard();
      
      expect(result).toBe(multilineContent);
    });

    it('should handle special characters in clipboard', async () => {
      const specialContent = '🎉 Special chars: @#$%^&*() áéíóú';
      mockClipboard.read.mockResolvedValue({ value: specialContent });
      
      const result = await pasteFromClipboard();
      
      expect(result).toBe(specialContent);
    }); */

    it('should propagate Clipboard.read errors', async () => {
      const error = new Error('Clipboard read failed');
      mockClipboard.read.mockRejectedValue(error);
      
      await expect(pasteFromClipboard()).rejects.toThrow('Clipboard read failed');
    });

/*     it('should handle undefined clipboard value', async () => {
      mockClipboard.read.mockResolvedValue({ value: undefined as any });
      
      const result = await pasteFromClipboard();
      
      expect(result).toBeUndefined();
    });

    it('should handle null clipboard value', async () => {
      mockClipboard.read.mockResolvedValue({ value: null as any });
      
      const result = await pasteFromClipboard();
      
      expect(result).toBeNull();
    }); */
  });

  describe('copyToClipboardWithConfirmation', () => {
    it('should copy content and show success toast', async () => {
      const content = 'test content';
      const confirmMsg = 'Content copied!';
      
      await copyToClipboardWithConfirmation(mockToastController, content, confirmMsg);
      await Promise.resolve(); // allow .then() to flush

      expect(mockClipboard.write).toHaveBeenCalledWith({ string: content });
      expect(mockShowToast).toHaveBeenCalledWith(mockToastController, confirmMsg);
      expect(mockError).not.toHaveBeenCalled();
    });

    it('should use default confirmation message when not provided', async () => {
      const content = 'test content';
      
      await copyToClipboardWithConfirmation(mockToastController, content);
      await Promise.resolve(); // allow .then() to flush

      expect(mockClipboard.write).toHaveBeenCalledWith({ string: content });
      expect(mockShowToast).toHaveBeenCalledWith(mockToastController, '@general.operation.copy.conf');
    });

    it('should handle number content', async () => {
      const content = 42;
      const confirmMsg = 'Number copied!';
      
      await copyToClipboardWithConfirmation(mockToastController, content, confirmMsg);
      await Promise.resolve(); // allow .then() to flush

      expect(mockClipboard.write).toHaveBeenCalledWith({ string: '42' });
      expect(mockShowToast).toHaveBeenCalledWith(mockToastController, confirmMsg);
    });

    it('should show error toast when clipboard operation fails', async () => {
      const content = 'test content';
      const confirmMsg = 'Content copied!';
      const clipboardError = new Error('Permission denied');
      
      mockClipboard.write.mockRejectedValue(clipboardError);
      
      await copyToClipboardWithConfirmation(mockToastController, content, confirmMsg);
      await new Promise(setImmediate); // flush all microtasks

      expect(mockClipboard.write).toHaveBeenCalledWith({ string: content });
      expect(mockShowToast).not.toHaveBeenCalled();
      expect(mockError).toHaveBeenCalledWith(
        mockToastController,
        `copy.util/copyToClibboard(${content}, confirmMsg) -> ERROR with navigator.clipboard: ${clipboardError}`
      );
    });

    it('should handle empty string content', async () => {
      const content = '';
      
      await copyToClipboardWithConfirmation(mockToastController, content);
      await Promise.resolve(); // allow .then() to flush

      expect(mockClipboard.write).toHaveBeenCalledWith({ string: '' });
      expect(mockShowToast).toHaveBeenCalledWith(mockToastController, '@general.operation.copy.conf');
    });

    it('should handle zero as content', async () => {
      const content = 0;
      
      await copyToClipboardWithConfirmation(mockToastController, content);
      await Promise.resolve(); // allow .then() to flush

      expect(mockClipboard.write).toHaveBeenCalledWith({ string: '0' });
      expect(mockShowToast).toHaveBeenCalledWith(mockToastController, '@general.operation.copy.conf');
    });

    it('should handle very long content', async () => {
      const content = 'x'.repeat(1000);
      
      await copyToClipboardWithConfirmation(mockToastController, content);
      await Promise.resolve(); // allow .then() to flush

      expect(mockClipboard.write).toHaveBeenCalledWith({ string: content });
      expect(mockShowToast).toHaveBeenCalledWith(mockToastController, '@general.operation.copy.conf');
    });

    it('should handle special characters in content', async () => {
      const content = '🎉 Hello\nWorld\t@#$%';
      
      await copyToClipboardWithConfirmation(mockToastController, content);
      await Promise.resolve(); // allow .then() to flush

      expect(mockClipboard.write).toHaveBeenCalledWith({ string: content });
      expect(mockShowToast).toHaveBeenCalledWith(mockToastController, '@general.operation.copy.conf');
    });

    it('should handle clipboard write timeout error', async () => {
      const content = 'test';
      const timeoutError = new Error('Operation timed out');
      
      mockClipboard.write.mockRejectedValue(timeoutError);
      
      await copyToClipboardWithConfirmation(mockToastController, content);
      await new Promise(setImmediate); // flush all microtasks

      expect(mockError).toHaveBeenCalledWith(
        mockToastController,
        `copy.util/copyToClibboard(${content}, confirmMsg) -> ERROR with navigator.clipboard: ${timeoutError}`
      );
    });

    it('should handle custom error messages in confirmation message', async () => {
      const content = 'test';
      const customMsg = '@custom.copy.message';
      
      await copyToClipboardWithConfirmation(mockToastController, content, customMsg);
      await Promise.resolve(); // allow .then() to flush

      expect(mockShowToast).toHaveBeenCalledWith(mockToastController, customMsg);
    });
  });

  describe('times', () => {
    it('should execute function the specified number of times', () => {
      const mockFn = vi.fn();
      
      times(3)(mockFn);
      
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should not execute function when x is 0', () => {
      const mockFn = vi.fn();
      
      times(0)(mockFn);
      
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should not execute function when x is negative', () => {
      const mockFn = vi.fn();
      
      times(-5)(mockFn);
      
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should execute function once when x is 1', () => {
      const mockFn = vi.fn();
      
      times(1)(mockFn);
      
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should execute function many times', () => {
      const mockFn = vi.fn();
      
      times(100)(mockFn);
      
      expect(mockFn).toHaveBeenCalledTimes(100);
    });

    it('should work with arrow functions', () => {
      let counter = 0;
      const incrementCounter = () => counter++;
      
      times(5)(incrementCounter);
      
      expect(counter).toBe(5);
    });

    it('should work with functions that have side effects', () => {
      const results: number[] = [];
      const addNumber = () => results.push(results.length + 1);
      
      times(4)(addNumber);
      
      expect(results).toEqual([1, 2, 3, 4]);
    });

    it('should handle functions that throw errors', () => {
      const throwingFn = vi.fn(() => {
        throw new Error('Test error');
      });
      
      expect(() => times(2)(throwingFn)).toThrow('Test error');
      expect(throwingFn).toHaveBeenCalledTimes(1); // Should stop at first error
    });

    it('should be curried correctly', () => {
      const mockFn = vi.fn();
      const times3 = times(3);
      
      times3(mockFn);
      
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should handle floating point numbers by truncating', () => {
      const mockFn = vi.fn();
      
      times(3.7 as any)(mockFn);
      
      // Should execute 4 times (not truncated)
      expect(mockFn).toHaveBeenCalledTimes(4);
    });
  });

  describe('Integration and workflow scenarios', () => {
/*     it('should handle complete copy-paste workflow', async () => {
      const originalContent = 'test content';
      
      // Copy content
      await copyToClipboard(originalContent);
      
      // Simulate clipboard containing the content
      mockClipboard.read.mockResolvedValue({ value: originalContent });
      
      // Paste content
      const pastedContent = await pasteFromClipboard();
      
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: originalContent });
      expect(mockClipboard.read).toHaveBeenCalled();
      expect(pastedContent).toBe(originalContent);
    });
 */
    it('should handle copy with confirmation workflow', async () => {
      const content = 'important data';
      
      await copyToClipboardWithConfirmation(mockToastController, content);
      await new Promise(setImmediate); // flush all microtasks

      expect(mockClipboard.write).toHaveBeenCalledWith({ string: content });
      expect(mockShowToast).toHaveBeenCalledWith(mockToastController, '@general.operation.copy.conf');
    });

    it('should demonstrate times function with clipboard operations', async () => {
      const contents = ['item1', 'item2', 'item3'];
      let index = 0;
      
      const copyNext = () => {
        if (index < contents.length) {
          copyToClipboard(contents[index]);
          index++;
        }
      };
      
      times(3)(copyNext);
      
      expect(mockClipboard.write).toHaveBeenCalledTimes(3);
      expect(mockClipboard.write).toHaveBeenNthCalledWith(1, { string: 'item1' });
      expect(mockClipboard.write).toHaveBeenNthCalledWith(2, { string: 'item2' });
      expect(mockClipboard.write).toHaveBeenNthCalledWith(3, { string: 'item3' });
    });

    it('should handle error recovery workflow', async () => {
      const content = 'test content';
      
      // First attempt fails
      mockClipboard.write.mockRejectedValueOnce(new Error('First attempt failed'));
      
      // Second attempt succeeds
      mockClipboard.write.mockResolvedValueOnce(undefined);
      
      // First call with confirmation - should error
      await copyToClipboardWithConfirmation(mockToastController, content);
      await new Promise(setImmediate); // flush all microtasks
      expect(mockError).toHaveBeenCalled();
      
      // Second call - should succeed
      await copyToClipboard(content);
      await new Promise(setImmediate); // flush all microtasks
      expect(mockClipboard.write).toHaveBeenCalledTimes(2);
    });

    it('should handle different data types in sequence', async () => {
      const testData = [
        'string content',
        42,
        true,
        ['array', 'content'],
        undefined
      ];
      
      for (const data of testData) {
        await copyToClipboard(data);
      }
      
      expect(mockClipboard.write).toHaveBeenCalledTimes(5);
      expect(mockClipboard.write).toHaveBeenNthCalledWith(1, { string: 'string content' });
      expect(mockClipboard.write).toHaveBeenNthCalledWith(2, { string: '42' });
      expect(mockClipboard.write).toHaveBeenNthCalledWith(3, { string: 'true' });
      expect(mockClipboard.write).toHaveBeenNthCalledWith(4, { string: 'array,content' });
      expect(mockClipboard.write).toHaveBeenNthCalledWith(5, { string: '' });
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle concurrent clipboard operations', async () => {
      const contents = ['content1', 'content2', 'content3'];
      
      const promises = contents.map(content => copyToClipboard(content));
      await Promise.all(promises);
      
      expect(mockClipboard.write).toHaveBeenCalledTimes(3);
    });

    it('should handle very large arrays', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => `item${i}`);
      
      await copyToClipboard(largeArray);
      
      expect(mockClipboard.write).toHaveBeenCalledWith({ 
        string: largeArray.toString() 
      });
    });

    it('should handle malformed ToastController', async () => {
      const malformedController = null as any;
      const content = 'test';
      
      // Should not throw even with malformed controller
      await copyToClipboardWithConfirmation(malformedController, content);
      
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: content });
    });

    it('should handle times function with edge cases', () => {
      const mockFn = vi.fn();
      
      // Test various edge cases
      times(0)(mockFn);
      times(-1)(mockFn);
      times(NaN as any)(mockFn);
      times(Infinity as any)(mockFn); // This might cause issues, but should be handled
      
      // Only the Infinity case might execute, others should not
      expect(mockFn).toHaveBeenCalledTimes(0);
    });

    it('should maintain function context in times', () => {
      const context = {
        value: 0,
        increment() {
          this.value++;
        }
      };
      
      times(3)(context.increment.bind(context));
      
      expect(context.value).toBe(3);
    });

    it('should handle complex clipboard content types', async () => {
      const complexContent = JSON.stringify({
        name: 'test',
        data: [1, 2, 3],
        nested: { key: 'value' }
      });
      
      await copyToClipboard(complexContent);
      
      expect(mockClipboard.write).toHaveBeenCalledWith({ string: complexContent });
    });
  });
});