import { DomSanitizer } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    downloadFilesAsZip,
    downloadTextFile,
    downloadToBrowser,
    exportCsv,
    generateDownloadURI,
    getExportFileName,
    rowsToCsv,
    toCsvFileName
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

vi.mock('@okr/shared-config', () => ({
  STORAGE: {}
}));

vi.mock('@okr/shared-util-core', () => ({
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

  describe('rowsToCsv', () => {
    it('joins cells with semicolon and rows with CRLF', () => {
      expect(rowsToCsv([['A', 'B'], ['1', '2']])).toBe('A;B\r\n1;2');
    });

    it('quotes cells containing the delimiter, quotes, or newlines (RFC 4180)', () => {
      expect(rowsToCsv([['a;b', 'c"d', 'e\nf']])).toBe('"a;b";"c""d";"e\nf"');
    });

    it('leaves umlauts untouched (UTF-8)', () => {
      expect(rowsToCsv([['Müller', 'Zürich']])).toBe('Müller;Zürich');
    });

    it('coerces null/undefined cells to empty strings', () => {
      expect(rowsToCsv([[null as unknown as string, undefined as unknown as string]])).toBe(';');
    });

    it('supports a custom delimiter', () => {
      expect(rowsToCsv([['a', 'b']], ',')).toBe('a,b');
      // a comma no longer forces quoting when the delimiter is a semicolon
      expect(rowsToCsv([['a,b']], ';')).toBe('a,b');
    });
  });

  describe('toCsvFileName', () => {
    it('normalizes .xlsx / .xls / .csv extensions to .csv', () => {
      expect(toCsvFileName('members.xlsx')).toBe('members.csv');
      expect(toCsvFileName('members.xls')).toBe('members.csv');
      expect(toCsvFileName('members.csv')).toBe('members.csv');
    });
    it('appends .csv when there is no recognized extension', () => {
      expect(toCsvFileName('members')).toBe('members.csv');
    });
  });

  describe('exportCsv', () => {
    it('downloads a .csv file via saveAs', async () => {
      const saveAs = (await import('file-saver')).saveAs;
      await exportCsv([['A', 'B'], ['1', '2']], 'test.xlsx', 'Sheet1');
      expect(saveAs).toHaveBeenCalledTimes(1);
      const [, name] = (saveAs as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
      expect(name).toBe('test.csv');
    });
  });

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


  describe('downloadFilesAsZip', () => {
    // A minimal JSZip stand-in: the assertions are about WHICH entries reach the archive and
    // under which names, not about zip encoding.
    const zipFile = vi.fn();
    const generateAsync = vi.fn(async () => new Blob(['zip']));
    vi.doMock('jszip', () => ({
      default: class { file = zipFile; generateAsync = generateAsync; }
    }));

    const okResponse = (body = 'x') => ({ ok: true, status: 200, blob: async () => new Blob([body]) });

    beforeEach(() => {
      zipFile.mockClear();
      generateAsync.mockClear();
    });

    it('returns without touching the archive when there is nothing to download', async () => {
      const result = await downloadFilesAsZip([], 'album');
      expect(result).toEqual({ zipped: 0, failed: [] });
      expect(generateAsync).not.toHaveBeenCalled();
    });

    it('zips every fetched entry and saves one archive', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
      const { saveAs } = await import('file-saver');

      const result = await downloadFilesAsZip(
        [{ url: 'u1', fileName: 'a.jpg' }, { url: 'u2', fileName: 'b.jpg' }], 'album');

      expect(result.zipped).toBe(2);
      expect(result.failed).toEqual([]);
      expect(zipFile).toHaveBeenCalledTimes(2);
      expect(saveAs).toHaveBeenCalledTimes(1);
    });

    it('appends .zip only when the name does not already carry it', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => okResponse()));
      const { saveAs } = await import('file-saver');

      await downloadFilesAsZip([{ url: 'u', fileName: 'a.jpg' }], 'album');
      expect(vi.mocked(saveAs).mock.calls[0][1]).toBe('album.zip');

      vi.mocked(saveAs).mockClear();
      await downloadFilesAsZip([{ url: 'u', fileName: 'a.jpg' }], 'album.zip');
      expect(vi.mocked(saveAs).mock.calls[0][1]).toBe('album.zip');
    });

    it('suffixes duplicate file names instead of overwriting them inside the archive', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => okResponse()));

      await downloadFilesAsZip(
        [{ url: 'u1', fileName: 'a.jpg' }, { url: 'u2', fileName: 'a.jpg' }, { url: 'u3', fileName: 'a.jpg' }],
        'album');

      const names = zipFile.mock.calls.map((call) => call[0]);
      expect(names).toEqual(['a.jpg', 'a (2).jpg', 'a (3).jpg']);
    });

    it('skips an entry that cannot be fetched and reports it, still saving the rest', async () => {
      vi.stubGlobal('fetch', vi.fn(async (url: string) =>
        url === 'bad' ? { ok: false, status: 404 } : okResponse()));
      const { saveAs } = await import('file-saver');

      const result = await downloadFilesAsZip(
        [{ url: 'u1', fileName: 'a.jpg' }, { url: 'bad', fileName: 'gone.jpg' }], 'album');

      expect(result).toEqual({ zipped: 1, failed: ['gone.jpg'] });
      expect(saveAs).toHaveBeenCalledTimes(1);
    });

    it('saves nothing when every entry failed', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
      const { saveAs } = await import('file-saver');

      const result = await downloadFilesAsZip([{ url: 'u', fileName: 'a.jpg' }], 'album');

      expect(result).toEqual({ zipped: 0, failed: ['a.jpg'] });
      expect(saveAs).not.toHaveBeenCalled();
    });

    it('honours the cap so a huge folder cannot blow up the tab', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => okResponse()));

      const entries = Array.from({ length: 5 }, (_, i) => ({ url: `u${i}`, fileName: `f${i}.jpg` }));
      const result = await downloadFilesAsZip(entries, 'album', 2);

      expect(result.zipped).toBe(2);
      expect(zipFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('getExportFileName', () => {
    it('should return formatted file name', () => {
      const result = getExportFileName('scsSrv_1234', 'xlsx');
      expect(result).toBe('20240117scsSrv_1234.xlsx');
    });
  });
});