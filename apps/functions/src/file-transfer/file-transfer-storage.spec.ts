import { fileTransferFilePath, fileTransferPrefix } from './file-transfer-storage';

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
});
