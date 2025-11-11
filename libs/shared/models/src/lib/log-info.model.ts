import { DEFAULT_NAME } from "@bk2/shared-constants";

export interface LogInfo {
  id: string;
  name: string;
  message: string;
}

export function logMessage(log: LogInfo[], message: string): LogInfo[] {
  log.push({ id: 'MESSAGE_ONLY', name: DEFAULT_NAME, message: message });
  return log;
}
