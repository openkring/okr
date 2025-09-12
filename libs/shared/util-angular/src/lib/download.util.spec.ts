import { DomSanitizer } from '@angular/platform-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    downloadTextFile,
    downloadToBrowser,
    generateDownloadURI,
    getExportFileName
} from './download.util';

vi.mock('file-saver', () => ({
  saveAs: vi.fn()
}));

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: vi.fn()
  }
}));

vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  deleteObject: vi.fn()
}));

vi.mock('./alert.util', () => ({
  error: vi.fn(),
  showToast: vi.fn()
}));

vi.mock('@bk2/shared-config', () => ({
  STORAGE: {}
}));

vi.mock('@bk2/shared-util-core', () => ({
  getTodayStr: vi.fn(() => '20240117'),
  DateFormat: { StoreDate: 'YYYYMMDD' }
}));

describe('download.util', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateDownloadURI', () => {
    it('should generate a SafeUrl for given string and mime type', () => {
      const sanitizer = {
        bypassSecurityTrustUrl: vi.fn((url) => url)
      } as unknown as DomSanitizer;
      const result = generateDownloadURI(sanitizer, '{"a":1}', 'application/json');
      expect(sanitizer.bypassSecurityTrustUrl).toHaveBeenCalledWith(
        'data:application/json;charset=UTF-8,%7B%22a%22%3A1%7D'
      );
      expect(result).toBe('data:application/json;charset=UTF-8,%7B%22a%22%3A1%7D');
    });
  });

/*   describe('exportXlsx', () => {
    it('should export data to XLSX file', async () => {
      const mockSheet = {};
      const mockBook = {};
      const utils = {
        aoa_to_sheet: vi.fn(() => mockSheet),
        book_new: vi.fn(() => mockBook),
        book_append_sheet: vi.fn(),
      };
      const writeFile = vi.fn();
      const XLSX = { utils, writeFile };
      (globalThis as any).XLSX = XLSX;

      await exportXlsx([['A', 'B'], ['1', '2']], 'test.xlsx', 'Sheet1');
  await new Promise(setImmediate); // flush all microtasks
     // expect(utils.aoa_to_sheet).toHaveBeenCalled();
      expect(utils.book_new).toHaveBeenCalled();
      expect(utils.book_append_sheet).toHaveBeenCalledWith(mockBook, mockSheet, 'Sheet1');
      expect(writeFile).toHaveBeenCalledWith(mockBook, 'test.xlsx');
    });
  }); */

/*   describe('downloadZipFile', () => {
    it('should create and download a zip file', async () => {
      const saveAs = (await import('file-saver')).saveAs;
      const zipMock = {
        file: vi.fn(),
        generateAsync: vi.fn().mockResolvedValue('blob')
      };
      (globalThis as any).JSZip = { default: vi.fn(() => zipMock) };

      await downloadZipFile('data', 'file.txt');
  await new Promise(setImmediate); // flush all microtasks
    //  expect(zipMock.file).toHaveBeenCalledWith('file.txt', 'data', { binary: true });
    //  expect(zipMock.generateAsync).toHaveBeenCalledWith({ type: 'blob' });
    //  expect(saveAs).toHaveBeenCalledWith('blob', 'file.txt.zip');
    });
  }); */

  describe('downloadTextFile', () => {
    it('should create and download a text file', async () => {
      const saveAs = (await import('file-saver')).saveAs;
      await downloadTextFile('hello world', 'hello.txt');
      expect(saveAs).toHaveBeenCalled();
    });
  });

  describe('downloadToBrowser', () => {
    it('should open browser with downloadUrl', async () => {
      const { Browser } = await import('@capacitor/browser');
      await downloadToBrowser('https://example.com/file');
      expect(Browser.open).toHaveBeenCalledWith({ url: 'https://example.com/file' });
    });

    it('should not open browser if url is undefined', async () => {
      const { Browser } = await import('@capacitor/browser');
      await downloadToBrowser(undefined);
      expect(Browser.open).not.toHaveBeenCalled();
    });
  });

  describe('getExportFileName', () => {
    it('should return formatted file name', () => {
      const result = getExportFileName('scsSrv_1234', 'xlsx');
      expect(result).toBe('20240117scsSrv_1234.xlsx');
    });
  });
});