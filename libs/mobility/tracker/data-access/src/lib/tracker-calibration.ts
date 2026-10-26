import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** Folder (relative to Documents) where TrackerLocation.calibrationStart writes its CSV files (spec 1.122 §5.2). */
const CALIBRATION_DIR = 'calibration';

export interface CalibrationMeta {
  placement: 'bag' | 'mounted';
  countedStrokes?: number;
  startedAt: string; // ISO, from the file name
}

/** The calibration recordings on this device, newest first (`calibration/row-<ms>.csv`); [] on the web or when none exist. */
export async function listCalibrationFiles(): Promise<string[]> {
  try {
    const { files } = await Filesystem.readdir({ path: CALIBRATION_DIR, directory: Directory.Documents });
    return files.map((f) => f.name).filter((n) => /^row-\d+\.csv$/.test(n)).sort().reverse().map((n) => `${CALIBRATION_DIR}/${n}`);
  } catch {
    return [];
  }
}

/** Writes the sidecar `row-<ms>.json` next to the CSV and opens the share sheet with both files. */
export async function shareCalibration(file: string, meta: CalibrationMeta): Promise<void> {
  const metaPath = file.replace(/\.csv$/, '.json');
  await Filesystem.writeFile({ path: metaPath, directory: Directory.Documents, data: JSON.stringify(meta, null, 2), encoding: Encoding.UTF8 });
  const [csv, json] = await Promise.all([
    Filesystem.getUri({ path: file, directory: Directory.Documents }),
    Filesystem.getUri({ path: metaPath, directory: Directory.Documents }),
  ]);
  await Share.share({ files: [csv.uri, json.uri] });
}
