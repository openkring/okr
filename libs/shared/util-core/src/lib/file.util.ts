import mime from 'mime';
import { die } from './log.util';

/*------------------------ file pathes -----------------------*/
/**
 * Terminology:
 * 
 * fullPath = path/to/a/filename.txt (can be relative or absolute, ie starting with /)
 * (file)name = baseName.txt                  fileName(fullPath), baseName + . + extension
 * dir = path/to/a                            dirname(fullPath)
 * baseName = baseName                        baseName(fullPath) = fileName without extension
 * extension = txt                            fileExtension(fullPath)
 */

/**
 * Extracts the fileName from a full file path, i.e. stripping its directory.
 * e.g. path/to/a/filename.txt -> baseName.ext
 * @param fullPath dir{/dir}/baseName.ext
 * @param dirSep the separator character, default is / on unix
 * @returns fileName = baseName.ext
 */
export function fileName(fullPath: string, dirSep = '/'): string {
    return fullPath.substring(fullPath.lastIndexOf(dirSep) + 1);
}
  
/**
 * Strips the fileName off a fullPath.
 * e.g. path/to/a/filename.txt -> path/to/a
 * Will not work on Urls (because of / in queries).
 * See: https://stackoverflow.com/questions/2187256/js-most-optimized-way-to-remove-a-filename-from-a-path-in-a-string
 * @param fullPath dir{/dir}/baseName.ext
 * @param dirSep the separator character between dirs, default is / on unix
 */
export function dirName(fullPath: string, dirSep = '/'): string {
  // simple check on the most common url protocols
  if (fullPath.startsWith('http') || fullPath.startsWith('ftp')) die('file.util: dirName can not be applied on urls');
  return fullPath.substring(0, fullPath.lastIndexOf(dirSep));
}

/**
 * Returns the blank baseName without its dir(s) and extension.
 * e.g. /a/b/c/baseName.txt -> fileName
 * @param fullPath the baseName of the fileName
 */
export function baseName(fullPath: string, fileSep = '.', dirSep = '/'): string {
  const _fn = fileName(fullPath, dirSep);
  return _fn.substring(0, _fn.lastIndexOf(fileSep));
}

/**
 * Returns the extension of a full path name.
 * e.g. /a/b/c/filename.txt -> txt
 * @param fullPath the full path name (e.g. /a/b/c/filename.txt)
 * @returns the file extension (e.g. txt)
 */
export function fileExtension(fullPath: string, fileSep = '.'): string {
    return fullPath.substring(fullPath.lastIndexOf(fileSep) + 1)
}

/**
 * Return the svg logo of a file
 * @param fullPath the full path name (e.g. /a/b/c/filename.txt)
 * @returns the svg icon name of the logo
 */
export function fileLogo(fullPath: string): string {
  const _ext = fileExtension(fullPath);
  switch(_ext) {
    case 'pdf': return 'assets/filetypes/pdf.svg';
    case 'csv': return 'assets/filetypes/csv.svg';
    case 'xls': 
    case 'xltx':
    case 'xlt':
    case 'xlsx': return 'assets/filetypes/xls.svg';
    case 'pages': return 'assets/filetypes/pages.svg';
    case 'key': return 'assets/filetypes/key.svg';
    case 'numbers': return 'assets/filetypes/numbers.svg';
    case 'jpg': 
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'tif': return 'assets/filetypes/image.svg';
    case 'html': return 'assets/filetypes/html.svg';
    case 'md':
    case 'txt': return 'assets/filetypes/txt.svg';
    case 'doc': 
    case 'dot':
    case 'dotx':
    case 'docx': return 'assets/filetypes/doc.svg';
    case 'mov':
    case 'mp4':
    case 'mpg': return 'assets/filetypes/video.svg';
    case 'zip': return 'assets/filetypes/zip.svg';
    case 'php':
    case 'scss':
    case 'css':
    case 'ts':
    case 'go':
    case 'java':
    case 'js':
    case 'py':
    case 'json': return 'assets/filetypes/code.svg';
    case 'pptx':
    case 'ppt': return 'assets/filetypes/ppt.svg';
    default: return 'assets/filetypes/file.svg';
  }
}

export const FileSizeUnits = [
    'bytes',
    'KB',
    'MB',
    'GB',
    'TB',
    'PB'
];

/*
 * Convert bytes into largest possible unit.
 * Takes a precision argument that defaults to 2.
 * Usage:
 *   bytes | fileSize:precision
 * Example:
 *   {{ 1024 |  fileSize}}
 *   formats to: 1 KB
*/
export function fileSizeUnit(bytes = 0, precision = 2): string {
    if (isNaN(parseFloat(String(bytes))) || !isFinite(bytes)) return '?';
    let _unit = 0;
    while (bytes >= 1024) {
        bytes /= 1024;
        _unit++;
    }
    return bytes.toFixed(+ precision) + ' ' + FileSizeUnits[_unit];
}

export function getMimeType(pathOrExtension: string): string {
  return mime.getType(pathOrExtension) ?? '';
}

export function getExtensionFromMimeType(mimeType: string): string {
  return mime.getExtension(mimeType) ?? '';
}

export function isMimeTypeAccepted(mimeType: string, imagesOnly = false): boolean {
  // common images are always accepted
  if (mimeType.startsWith('image/jpeg') || mimeType.startsWith('image/png')) {
    return true;
  } // pdfs are accepted as normal documents
  if (imagesOnly === false && mimeType.startsWith('application/pdf')) {
    return true;
  }
  return false;
}

export function isOfFileType(pathOrExtension: string, mimeType: string): boolean {
  const _mimeType = getMimeType(pathOrExtension);
  return !!_mimeType?.startsWith(mimeType);
}

export function isImage(pathOrExtension: string): boolean {
  return isOfFileType(pathOrExtension, 'image');
}

export function isPdf(pathOrExtension: string): boolean {
  return isOfFileType(pathOrExtension, 'application/pdf');
}

export function isVideo(pathOrExtension: string): boolean {
  return isOfFileType(pathOrExtension, 'video');
}

// HLS consists of a m3u8 text file and several ts files (video/mp2t, mgep transport stream).
export function isStreamingVideo(pathOrExtension: string): boolean {
  return isOfFileType(pathOrExtension, 'application/vnd.apple.mpegurl');
}

export function isAudio(pathOrExtension: string): boolean {
  return isOfFileType(pathOrExtension, 'audio');
}

export function isText(pathOrExtension: string): boolean {
  return isOfFileType(pathOrExtension, 'text') ||
         isOfFileType(pathOrExtension, 'application/json') ||
         isOfFileType(pathOrExtension, 'application/javascript') ||
         isOfFileType(pathOrExtension, 'application/typescript') ||
         isOfFileType(pathOrExtension, 'application/xml') ||
         isOfFileType(pathOrExtension, 'application/xhtml+xml') ||
         isOfFileType(pathOrExtension, 'application/x-httpd-php') ||
         isOfFileType(pathOrExtension, 'application/x-httpd-cgi') ||
         isOfFileType(pathOrExtension, 'application/x-javascript') ||
         isOfFileType(pathOrExtension, 'application/x-latex') ||
         isOfFileType(pathOrExtension, 'application/x-perl') ||
         isOfFileType(pathOrExtension, 'application/x-shellscript') ||
         isOfFileType(pathOrExtension, 'application/x-sh') ||
         isOfFileType(pathOrExtension, 'application/x-tcl') ||
         isOfFileType(pathOrExtension, 'application/x-tex') ||
         isOfFileType(pathOrExtension, 'application/x-texinfo') ||
         isOfFileType(pathOrExtension, 'application/x-troff') ||
         isOfFileType(pathOrExtension, 'application/x-csh') ||
         isOfFileType(pathOrExtension, 'application/rtf');
}

export function isFont(pathOrExtension: string): boolean {
  return isOfFileType(pathOrExtension, 'font') ||
    isOfFileType(pathOrExtension, 'application/vnd.ms-fontobject');
}

export function isBinary(pathOrExtension: string): boolean {
  return isOfFileType(pathOrExtension, 'application/octet-stream');
}

// a document is a file of a well-known application.
// it is not an image, video, audio, pdf, text, or font (e.g. word, powerpoint, excel)
// typically, such a file is not displayed inline but downloaded for further processing.
export function isDocument(pathOrExtension: string): boolean {
  return isOfFileType(pathOrExtension, 'application/x-abiword') ||
        isOfFileType(pathOrExtension, 'application/vnd.amazon.ebook') ||
        isOfFileType(pathOrExtension, 'application/msword') ||
        isOfFileType(pathOrExtension, 'application/vnd.ms-powerpoint') ||
        isOfFileType(pathOrExtension, 'application/vnd.ms-excel') ||
        isOfFileType(pathOrExtension, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') ||
        isOfFileType(pathOrExtension, 'application/vnd.openxmlformats-officedocument.presentationml.presentation') ||
        isOfFileType(pathOrExtension, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') ||
        isOfFileType(pathOrExtension, 'application/epub+zip') ||
        isOfFileType(pathOrExtension, 'application/vnd.oasis.opendocument.presentation') ||
        isOfFileType(pathOrExtension, 'application/vnd.oasis.opendocument.spreadsheet')  ||
        isOfFileType(pathOrExtension, 'application/vnd.oasis.opendocument.text') ||
        isOfFileType(pathOrExtension, 'application/vnd.visio') ||
        isOfFileType(pathOrExtension, 'application/vnd.apple.pages') ||
        isOfFileType(pathOrExtension, 'application/vnd.apple.numbers') ||
        isOfFileType(pathOrExtension, 'application/vnd.apple.keynote');
}

export function isZip(pathOrExtension: string): boolean { 
  return isOfFileType(pathOrExtension, 'application/zip') ||
         isOfFileType(pathOrExtension, 'application/x-zip-compressed') ||
         isOfFileType(pathOrExtension, 'application/x-zip') ||
         isOfFileType(pathOrExtension, 'application/x-compressed') ||
         isOfFileType(pathOrExtension, 'application/x-compress') ||
         isOfFileType(pathOrExtension, 'application/x-tar') ||
         isOfFileType(pathOrExtension, 'application/x-gzip') ||
         isOfFileType(pathOrExtension, 'application/x-bzip2') ||
         isOfFileType(pathOrExtension, 'application/x-bzip') ||
         isOfFileType(pathOrExtension, 'application/x-7z-compressed') ||
         isOfFileType(pathOrExtension, 'application/java-archive') ||
        isOfFileType(pathOrExtension, 'application/vnd.rar') ||
         isOfFileType(pathOrExtension, 'application/vnd.apple.installer+xml');
}

export function blobToFile(theBlob: Blob, fileName: string): File {
  return new File([theBlob], fileName, { type: theBlob.type, lastModified: Date.now() });
}

/**
 * Convert BASE64 to BLOB
 * @param base64Image Pass Base64 image data to convert into the BLOB
 */
export function convertBase64ToBlob(base64Image: string) {
  // Split into two parts
  const parts = base64Image.split(';base64,');

  // Hold the content type
  const imageType = parts[0].split(':')[1];

  // Decode Base64 string
  const decodedData = Buffer.from(parts[1], 'base64').toString('binary');

  // Create UNIT8ARRAY of size same as row data length
  const uInt8Array = new Uint8Array(decodedData.length);

  // Insert all character code into uInt8Array
  for (let i = 0; i < decodedData.length; ++i) {
    uInt8Array[i] = decodedData.charCodeAt(i);
  }

  // Return BLOB image after conversion
  return new Blob([uInt8Array], { type: imageType });
}

