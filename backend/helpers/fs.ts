import os from "os";
import fs from "fs";

export const LOG_DIR = os.homedir() + "/.shinro/logs";

export const getLogDirectory = (
  query_id: string,
  ensure: boolean = false,
): string | null => {
  const currentLogDirectory = `${LOG_DIR}/${query_id}`;
  if (!fs.existsSync(currentLogDirectory)) {
    if (!ensure) return null;
    fs.mkdirSync(currentLogDirectory, { recursive: true });
  }
  return currentLogDirectory;
};

export const getTracePath = (
  query_id: string,
  ensure: boolean = false,
): string | null => {
  const logDir = getLogDirectory(query_id, ensure);
  return logDir ? `${logDir}/trace.txt` : null;
};

export const getQueryLogPath = (
  query_id: string,
  ensure: boolean = false,
): string | null => {
  const logDir = getLogDirectory(query_id, ensure);
  return logDir ? `${logDir}/query_log.json` : null;
};

export const getViewLogPath = (
  query_id: string,
  ensure: boolean = false,
): string | null => {
  const logDir = getLogDirectory(query_id, ensure);
  return logDir ? `${logDir}/query_views_log.json` : null;
};

export const getTablesPath = (
  query_id: string,
  ensure: boolean = false,
): string | null => {
  const logDir = getLogDirectory(query_id, ensure);
  return logDir ? `${logDir}/tables.json` : null;
};
