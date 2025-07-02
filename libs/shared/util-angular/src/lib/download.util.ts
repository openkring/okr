import { Inject } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ToastController } from '@ionic/angular';
import { Browser } from '@capacitor/browser';
import { ref, getDownloadURL, deleteObject } from "firebase/storage";
import * as XLSX from 'xlsx';
import * as JSZip from 'jszip';
import { saveAs } from 'file-saver';

import { STORAGE } from '@bk2/shared/config';
import { DateFormat, getTodayStr } from '@bk2/shared/util-core';

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

    /*---------------------------------------- Excel / XLSX  -----------------------------------*/
    /**
 * Exports data to an XLSX file with a single worksheet.
 * @param data The data to export, as a 2D array of strings.
 * @param fileName The name of the file to save the data to.
 * @param tableName The name of the worksheet to create.
 * @returns A promise that resolves when the file has been saved.
 */
    export async function exportXlsx(
        data: string[][], 
        fileName: string, 
        tableName: string) {
      // generate worksheet
      const _ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(data);

      // generate workbook and add the worksheet
      const _wb: XLSX.WorkBook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(_wb, _ws, tableName);

      // write the workbook to a file (does probably not work on mobile devices)
      XLSX.writeFile(_wb, fileName);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zip: JSZip = new (<any>JSZip).default();
  // Create blob for data
  // const blob1 = new Blob([data], { type: 'text/plain' });
  
  // Create a zip archive using JSZip library
  //const zip = new JSZip();
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
    } catch (_ex) {
      error(toastController, `download.util/download failed: ${JSON.stringify(_ex)}`);
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
    catch(_ex) {
      error(toastController, 'download.util/downloadFileFromStorage(' + path + ') -> ERROR: ' + JSON.stringify(_ex));  
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
    catch(_ex) {
      error(toastController, 'download.util/deleteFileFromStorage(' + path + ') -> ERROR: ' + JSON.stringify(_ex));
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

