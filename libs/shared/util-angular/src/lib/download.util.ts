import { Inject } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Browser } from '@capacitor/browser';
import { ToastController } from '@ionic/angular';
import { saveAs } from 'file-saver';
import { deleteObject, getDownloadURL, ref } from "firebase/storage";

import { STORAGE } from '@bk2/shared-config';
import { DateFormat, getTodayStr } from '@bk2/shared-util-core';

import { error, showToast } from './alert.util';
// import * as papa from 'papaparse'; // for csv conversions

/**
   * Generate a download URL (that can be used in a href tag).
   * @param stringifiedObj a stringified object
   * @param mimeType the mime type
   */
  export function generateDownloadURI(sanitizer: DomSanitizer, stringifiedObj: string, mimeType: string): SafeUrl {
    return sanitizer.bypassSecurityTrustUrl('data:' + mimeType + ';charset=UTF-8,' + encodeURIComponent(stringifiedObj));
  }

    /*---------------------------------------- CSV (Excel / Numbers / Google Sheets) -----------*/
    /**
 * Exports a 2D string array to a CSV file and downloads it.
 *
 * Semicolon-delimited with a leading UTF-8 BOM so it opens directly (double-click)
 * in Excel on de-CH/German locales, while Numbers and Google Sheets auto-detect the
 * delimiter. Cells are quoted per RFC 4180 (a field containing the delimiter, a
 * double-quote, or a line break is wrapped in quotes with internal quotes doubled).
 *
 * Replaces the former xlsx-based export — the `xlsx` (SheetJS) dependency was removed
 * because it carried two unfixable High advisories and was overkill for export-only use
 * (security report H-8). A Blob + saveAs download also works on mobile, unlike
 * `XLSX.writeFile`.
 *
 * @param data The data to export, as a 2D array of string cells.
 * @param fileName The output file name; any extension is normalized to `.csv`.
 * @param _sheetName Ignored; kept for signature compatibility with the old export.
 * @returns A promise that resolves when the download has been triggered.
 */
    export async function exportCsv(
        data: string[][],
        fileName: string,
        _sheetName?: string): Promise<void> {
      // Leading BOM (U+FEFF) makes Excel read it as UTF-8 (correct umlauts).
      const bom = String.fromCharCode(0xfeff);
      const blob = new Blob([bom + rowsToCsv(data)], { type: 'text/csv;charset=utf-8' });
      saveAs(blob, toCsvFileName(fileName));
    }

    /**
     * Serialize rows to a CSV string (RFC 4180 quoting, CRLF line breaks). Pure —
     * no BOM, no I/O — so it is unit-testable; `exportCsv` adds the BOM and downloads.
     * @param data rows of string cells
     * @param delimiter field separator (default `;` — opens directly in de-CH Excel)
     */
    export function rowsToCsv(data: string[][], delimiter = ';'): string {
      const special = new RegExp(`["${delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r\\n]`);
      const escapeCell = (value: string): string => {
        const cell = String(value ?? '');
        return special.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
      };
      return data.map((row) => row.map(escapeCell).join(delimiter)).join('\r\n');
    }

    /** Normalize any export file name (e.g. `members.xlsx`) to a `.csv` name. */
    export function toCsvFileName(fileName: string): string {
      return fileName.replace(/\.(xlsx?|csv)$/i, '') + '.csv';
    }

/*---------------------------------------- ZIPed TEXT  -----------------------------------*/
/**
 * Converts data into a zip file and downloads it on the client side.
 * - KML files as KMZ files (data:string from convertToKml)
 * @param data 
 * @param filename 
 * @returns 
 */
export async function downloadZipFile(data: string, filename: string): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file(filename, data, { binary: true });
  
  // Generate the ZIP content as a blob
  const _zippedBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(_zippedBlob, filename + '.zip');
}

    /*---------------------------------------- TEXT  -----------------------------------*/
export async function downloadTextFile(data: string, filename: string): Promise<void> {
  const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, filename);
}

    /*---------------------------------------- JSON  -----------------------------------*/
    /*
    export function exportJson(platform: Platform, toastController: ToastController, data: string[], fileName: string) {
      download(platform, toastController, data, fileName, 'text/json');
    }
    */

    /*---------------------------------------- CSV  -----------------------------------*/
    /*
    export function exportCsv(data: any[], fileName: string, fields: string[]) {
      const _config = {
        quotes: false,
        quoteChar: '"',
        escapeChar: '"',
        delimiter: ',',
        header: false,
        newline: '\r\n'
      };
        const _csv = papa.unparse({
        fields: fields,
        data: data
      }, _config); */
  //    download(_csv, fileName, 'text/csv');

  /*---------------------------------------- general helpers  -----------------------------------*/
  /*
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export async function download(platform: Platform, toastController: ToastController, data: any, targetDirectory: string, fileName: string, mimeType: string) {
    try {
      const _blob: Blob = new Blob([data], {type: mimeType});
      if (platform.is('mobile')) {
        if (!targetDirectory) die('download.util/download: targetDirectory is mandatory');
        const _dentry = await file.resolveDirectoryUrl(targetDirectory);
        const _url: string = _dentry.nativeURL || '';
        await file.writeFile(_url, fileName, _blob, {replace: true});
        log(`download.util/download: wrote ${fileName} in ${_url}`);
       } else {
        error(toastController, `download.util/download: ERROR: wrong platform: ${platform.platforms}`);
      }
    } catch (ex) {
      error(toastController, `download.util/download failed: ${JSON.stringify(ex)}`);
    }
  }
  */

        /*
        https://stackoverflow.com/questions/61892608/how-to-download-file-from-url-in-ionic-5-without-using-filetransfer
// import { HTTP } from '@ionic-native/http/ngx';
// import { File } from '@ionic-native/file/ngx';
export function downloadFileAndStore(file: File) {
  const filePath = file.dataDirectory + fileName; 
        // for iOS use file.documentsDirectory
        
        nativeHTTP.downloadFile('your-url', {}, {}, filePath).then(response => {
           // prints 200
           console.log('success block...', response);
        }).catch(err => {
            // prints 403
            console.log('error block ... ', err.status);
            // prints Permission denied
            console.log('error block ... ', err.error);
        })
     }
  }
  */

/**
 * Downloads a file to the browser by opening the download URL in a new window or tab.
 * @param downloadUrl The URL to download the file from.
 * @returns A promise that resolves when the download starts.
 */
  export async function downloadToBrowser(downloadUrl?: string): Promise<void> {
    if (downloadUrl) {
      Browser.open({ url: downloadUrl });
    }
  }

 
  /**
 * Downloads a file from Firebase Storage and returns its download URL.
 * @param toastController The ToastController to use for error messages.
 * @param path The path to the file in Firebase Storage.
 * @returns A promise that resolves with the download URL, or an empty string if there was an error.
 */
  export async function downloadFileFromStorage(toastController: ToastController, path: string): Promise<string> {
    try {
      const _storage = Inject(STORAGE);
      return await getDownloadURL(ref(_storage, path));
    }
    catch(ex) {
      error(toastController, 'download.util/downloadFileFromStorage(' + path + ') -> ERROR: ' + JSON.stringify(ex));  
      return '';
    }
  }

  export async function deleteFileFromStorage(toastController: ToastController, path: string): Promise<void> {
    try {
      const _storage = Inject(STORAGE);
      const _ref = ref(_storage, path);
      deleteObject(_ref);
      showToast(toastController, '@document.operation.delete.conf');
    }
    catch(ex) {
      error(toastController, 'download.util/deleteFileFromStorage(' + path + ') -> ERROR: ' + JSON.stringify(ex));
    }
  }

  /**
   * Returns a file name in the following format: YYYYMMDD<fileName>_<random4>.<extension>.
   * Example:   20240117scsSrv_1234.xlsx
   * @param fileName 
   * @param extension 
   * @returns a string with the formatted filename
   */
  export function getExportFileName(fileName: string, extension: string): string {
    return getTodayStr(DateFormat.StoreDate) +  fileName + '.' + extension;
  }

