import { describe, expect, it } from 'vitest';
import { baseName, dirName, fileExtension, fileName, fileSizeUnit } from './file.util';

describe('file.util', () => {

    // basename
    it('fileName("path/to/a/baseName.txt") should be baseName.txt.', () => {
        const result = fileName('path/to/a/baseName.txt');
        expect(result).toEqual('baseName.txt');
    });
    it('fileName("path_to_a_baseName.txt", "_") should be baseName.txt.', () => {
        const result = fileName('path_to_a_baseName.txt', '_');
        expect(result).toEqual('baseName.txt');
    });
    it('fileName("path\\to\\a\\baseName.txt", "\\") should be baseName.txt.', () => {
        const result = fileName('path\\to\\a\\baseName.txt', '\\');
        expect(result).toEqual('baseName.txt');
    });
    it('fileName("baseName.txt") should be baseName.txt.', () => {
        const result = fileName('baseName.txt');
        expect(result).toEqual('baseName.txt');
    });
    it('baseName("baseName.ext") should be baseName', () => {
        const result = baseName('baseName.ext');
        expect(result).toEqual('baseName');
    });
    it('baseName("/path/to/a/baseName.ext") should be baseName.', () => {
        const result = baseName('/path/to/a/baseName.ext');
        expect(result).toEqual('baseName');
    });
    it('baseName(".ext") should be empty.', () => {
      const result = baseName('.ext');
      expect(result).toEqual('');
    });

    // dirName
    it('dirName("path/to/a/baseName.ext") should be path/to/a.', () => {
        const result = dirName('path/to/a/baseName.ext');
        expect(result).toEqual('path/to/a');
    });
    it('dirName("path_to_a_baseName.ext", "_") should be path_to_a.', () => {
        const result = dirName('path_to_a_baseName.ext', '_');
        expect(result).toEqual('path_to_a');
    });
    it('dirName("path\\to\\a\\baseName.ext", "\\") should be path\\to\\a.', () => {
        const result = dirName('path\\to\\a\\baseName.ext', '\\');
        expect(result).toEqual('path\\to\\a');
    });
    it('dirName("baseName.ext") should be empty string.', () => {
        const result = dirName('baseName.ext');
        expect(result).toEqual('');
    });
    it('dirName("baseName") should be empty string.', () => {
        const result = dirName('baseName');
        expect(result).toEqual('');
    });
    it('dirName(".ext") should be empty.', () => {
        const result = dirName('.ext');
        expect(result).toEqual('');
    });

    // fileExtension
    it('fileExtension("/path/to/a/baseName.ext") should be ext.', () => {
        const result = fileExtension('/path/to/a/baseName.ext');
        expect(result).toEqual('ext');
    });
    it('fileExtension("path/to/a/baseName.ext") should be ext.', () => {
        const result = fileExtension('path/to/a/baseName.ext');
        expect(result).toEqual('ext');
    });
    it('fileExtension("baseName.ext") should be ext.', () => {
        const result = fileExtension('baseName.ext');
        expect(result).toEqual('ext');
    });
    it('fileExtension("") should be empty string.', () => {
        const result = fileExtension('');
        expect(result).toEqual('');
    });
    it('fileExtension("part.part.part.txt") should be ext.', () => {
        const result = fileExtension('part.part.part.ext');
        expect(result).toEqual('ext');
    });

    // fileSizeUnit
    it('fileSizeUnit() should be 0 bytes.', () => {
        const result = fileSizeUnit();
        expect(result).toEqual('0.00 bytes');
    });
    it('fileSizeUnit(1024, 0) should be 1 KB.', () => {
        const result = fileSizeUnit(1024, 0);
        expect(result).toEqual('1 KB');
    });
    it('fileSizeUnit(1035) should be 1.01 KB.', () => {
        const result = fileSizeUnit(1035);
        expect(result).toEqual('1.01 KB');
    });
    it('fileSizeUnit(1135, 3) should be 1.108 KB.', () => {
        const result = fileSizeUnit(1135, 3);
        expect(result).toEqual('1.108 KB');
    });
    it('fileSizeUnit(1025, 3) should be 1.000 KB.', () => {
        const result = fileSizeUnit(1025, 3);
        expect(result).toEqual('1.001 KB'); // rounded from 1.0009
    });
    it('fileSizeUnit(1025, 4) should be 1.0009 KB (rounded from 1.000976).', () => {
        const result = fileSizeUnit(1025, 4);
        expect(result).toEqual('1.0010 KB');
    });
    it('fileSizeUnit(1035, 0) should be 1 KB.', () => {
        const result = fileSizeUnit(1035, 0);
        expect(result).toEqual('1 KB');
    });
    it('fileSizeUnit(1048576) should be 1.00 MB.', () => {
        const result = fileSizeUnit(1048576);
        expect(result).toEqual('1.00 MB');
    });
    it('fileSizeUnit(1073741824) should be 1 GB.', () => {
        const result = fileSizeUnit(1073741824);
        expect(result).toEqual('1.00 GB');
    });
    it('fileSizeUnit(1073741924) should be 1 GB.', () => {
        const result = fileSizeUnit(1073741824);
        expect(result).toEqual('1.00 GB');
    });
    it('fileSizeUnit(1073741924, 6) should be 1 GB.', () => {
        const result = fileSizeUnit(1073741824, 6);
        expect(result).toEqual('1.000000 GB');
    });
});