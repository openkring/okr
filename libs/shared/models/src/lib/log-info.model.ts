export interface LogInfo {
  id: string,
  name: string,
  message: string
}

export function logMessage(log: LogInfo[], message: string): LogInfo[] {
  log.push({ id: 'MESSAGE_ONLY', name: '', message: message });
  return log;
}