import { fileTransferFilePath, fileTransferPrefix, normalizeUploadOrigin } from './file-transfer-storage';

describe('file-transfer-storage', () => {
  it('builds a sanitised file path', () => {
    expect(fileTransferFilePath('scs', 't1', 0, '../Video 1.MOV')).toBe('tenant/scs/file-transfer/t1/0-Video_1.MOV');
  });
  it('builds the transfer prefix', () => {
    expect(fileTransferPrefix('scs', 't1')).toBe('tenant/scs/file-transfer/t1/');
  });
  it('never lets a name escape the prefix', () => {
    const p = fileTransferFilePath('scs', 't1', 2, '..\\..//etc/passwd');
    expect(p.startsWith('tenant/scs/file-transfer/t1/2-')).toBe(true);
    expect(p.slice('tenant/scs/file-transfer/t1/'.length)).not.toMatch(/[\\/]/);
  });
  it('falls back for an empty sanitised name', () => {
    expect(fileTransferFilePath('scs', 't1', 1, '///')).toBe('tenant/scs/file-transfer/t1/1-file');
  });

  describe('normalizeUploadOrigin', () => {
    it('reduces an http(s) URL to its origin', () => {
      expect(normalizeUploadOrigin('https://app.seeclub.org/private/file-transfer')).toBe('https://app.seeclub.org');
      expect(normalizeUploadOrigin('http://localhost:4200')).toBe('http://localhost:4200');
    });
    it('accepts the Android WebView origin https://localhost', () => {
      expect(normalizeUploadOrigin('https://localhost')).toBe('https://localhost');
    });
    it('accepts exactly capacitor://localhost for the iOS app', () => {
      expect(normalizeUploadOrigin('capacitor://localhost')).toBe('capacitor://localhost');
      expect(normalizeUploadOrigin('capacitor://localhost/')).toBe('capacitor://localhost');
    });
    it('rejects other schemes and garbage', () => {
      expect(normalizeUploadOrigin('capacitor://evil.example')).toBeUndefined();
      expect(normalizeUploadOrigin('ionic://localhost')).toBeUndefined();
      expect(normalizeUploadOrigin('ftp://example.org')).toBeUndefined();
      expect(normalizeUploadOrigin('not a url')).toBeUndefined();
      expect(normalizeUploadOrigin('')).toBeUndefined();
    });
  });
});
