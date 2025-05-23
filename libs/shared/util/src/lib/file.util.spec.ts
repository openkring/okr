import { basename, dirname, fileSizeUnit, getFileExtension, splitBaseName, stripExtension } from './file.util';

describe('file.util', () => {

    // basename
    it('basename("path/to/a/filename.txt") should be filename.txt.', () => {
        const _result = basename('path/to/a/filename.txt');
        expect(_result).toEqual('filename.txt');
    });
    it('basename("path_to_a_filename.txt", "_") should be filename.txt.', () => {
        const _result = basename('path_to_a_filename.txt', '_');
        expect(_result).toEqual('filename.txt');
    });
    it('basename("path\\to\\a\\filename.txt", "\\") should be filename.txt.', () => {
        const _result = basename('path\\to\\a\\filename.txt', '\\');
        expect(_result).toEqual('filename.txt');
    });
    it('basename("filename.txt") should be filename.txt.', () => {
        const _result = basename('filename.txt');
        expect(_result).toEqual('filename.txt');
    });
    it('basename("filename") should be filename.', () => {
        const _result = basename('filename');
        expect(_result).toEqual('filename');
    });
    it('basename("/path/to/a/filename.txt") should be filename.txt.', () => {
        const _result = basename('/path/to/a/filename.txt');
        expect(_result).toEqual('filename.txt');
    });

    // dirname
    it('dirname("path/to/a/filename.txt") should be path/to/a.', () => {
        const _result = dirname('path/to/a/filename.txt');
        expect(_result).toEqual('path/to/a');
    });
    it('dirname("path_to_a_filename.txt", "_") should be path_to_a.', () => {
        const _result = dirname('path_to_a_filename.txt', '_');
        expect(_result).toEqual('path_to_a');
    });
    it('dirname("path\\to\\a\\filename.txt", "\\") should be path\\to\\a.', () => {
        const _result = dirname('path\\to\\a\\filename.txt', '\\');
        expect(_result).toEqual('path\\to\\a');
    });
    it('dirname("filename.txt") should be empty string.', () => {
        const _result = dirname('filename.txt');
        expect(_result).toEqual('');
    });
    it('dirname("filename") should be empty string.', () => {
        const _result = dirname('filename');
        expect(_result).toEqual('');
    });
    it('dirname("/path/to/a/filename.txt") should be /path/to/a.', () => {
        const _result = dirname('/path/to/a/filename.txt');
        expect(_result).toEqual('/path/to/a');
    });

    // stripExtension
    it('stripExtension("/path/to/a/filename.txt") should be /path/to/a/filename.', () => {
        const _result = stripExtension('/path/to/a/filename.txt');
        expect(_result).toEqual('/path/to/a/filename');
    });
    it('stripExtension("path/to/a/filename.txt") should be path/to/a/filename.', () => {
        const _result = stripExtension('path/to/a/filename.txt');
        expect(_result).toEqual('path/to/a/filename');
    });
    it('stripExtension("filename.txt") should be filename.', () => {
        const _result = stripExtension('filename.txt');
        expect(_result).toEqual('filename');
    });
    it('stripExtension("") should be empty string.', () => {
        const _result = stripExtension('');
        expect(_result).toEqual('');
    });
    it('stripExtension("part.part.part.txt") should be part.part.part.', () => {
        const _result = stripExtension('part.part.part.txt');
        expect(_result).toEqual('part.part.part');
    });

    // getExtension
    it('getExtension("/path/to/a/filename.txt") should be txt.', () => {
        const _result = getFileExtension('/path/to/a/filename.txt');
        expect(_result).toEqual('txt');
    });
    it('getExtension("path/to/a/filename.txt") should be txt.', () => {
        const _result = getFileExtension('path/to/a/filename.txt');
        expect(_result).toEqual('txt');
    });
    it('getExtension("filename.txt") should be txt.', () => {
        const _result = getFileExtension('filename.txt');
        expect(_result).toEqual('txt');
    });
    it('getExtension("") should be empty string.', () => {
        const _result = getFileExtension('');
        expect(_result).toEqual('');
    });
    it('getExtension("part.part.part.txt") should be txt.', () => {
        const _result = getFileExtension('part.part.part.txt');
        expect(_result).toEqual('txt');
    });

    // splitBaseName
    it('splitBaseName("/path/to/a/filename.txt") should be ["/path/to/a/filename", "txt"].', () => {
        const _result = splitBaseName('/path/to/a/filename.txt');
        expect(_result).toEqual(['/path/to/a/filename', 'txt']);
    });
    it('splitBaseName("path/to/a/filename.txt") should be [path/to/a/filename, txt].', () => {
        const _result = splitBaseName('path/to/a/filename.txt');
        expect(_result).toEqual(['path/to/a/filename', 'txt']);
    });
    it('splitBaseName("filename.txt") should be [filename, txt].', () => {
        const _result = splitBaseName('filename.txt');
        expect(_result).toEqual(['filename', 'txt']);
    });
    // null and undefined are forbidden by strong type checking
    it('splitBaseName("") should be empty array', () => {
        const _result = splitBaseName('');
        expect(_result).toEqual([]);
    });
    it('splitBaseName("part.part.part.txt") should be empty array because of invalid name.', () => {
        const _result = splitBaseName('part.part.part.txt');
        expect(_result).toEqual([]);
    });
    // fileSizeUnit
    it('fileSizeUnit() should be 0 bytes.', () => {
        const _result = fileSizeUnit();
        expect(_result).toEqual('0.00 bytes');
    });
    it('fileSizeUnit(1024, 0) should be 1 KB.', () => {
        const _result = fileSizeUnit(1024, 0);
        expect(_result).toEqual('1 KB');
    });
    it('fileSizeUnit(1035) should be 1.01 KB.', () => {
        const _result = fileSizeUnit(1035);
        expect(_result).toEqual('1.01 KB');
    });
    it('fileSizeUnit(1135, 3) should be 1.108 KB.', () => {
        const _result = fileSizeUnit(1135, 3);
        expect(_result).toEqual('1.108 KB');
    });
    it('fileSizeUnit(1025, 3) should be 1.000 KB.', () => {
        const _result = fileSizeUnit(1025, 3);
        expect(_result).toEqual('1.001 KB'); // rounded from 1.0009
    });
    it('fileSizeUnit(1025, 4) should be 1.0009 KB (rounded from 1.000976).', () => {
        const _result = fileSizeUnit(1025, 4);
        expect(_result).toEqual('1.0010 KB');
    });
    it('fileSizeUnit(1035, 0) should be 1 KB.', () => {
        const _result = fileSizeUnit(1035, 0);
        expect(_result).toEqual('1 KB');
    });
    it('fileSizeUnit(1048576) should be 1.00 MB.', () => {
        const _result = fileSizeUnit(1048576);
        expect(_result).toEqual('1.00 MB');
    });
    it('fileSizeUnit(1073741824) should be 1 GB.', () => {
        const _result = fileSizeUnit(1073741824);
        expect(_result).toEqual('1.00 GB');
    });
    it('fileSizeUnit(1073741924) should be 1 GB.', () => {
        const _result = fileSizeUnit(1073741824);
        expect(_result).toEqual('1.00 GB');
    });
    it('fileSizeUnit(1073741924, 6) should be 1 GB.', () => {
        const _result = fileSizeUnit(1073741824, 6);
        expect(_result).toEqual('1.000000 GB');
    });
});