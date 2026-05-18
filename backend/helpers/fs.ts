import os from "os";
import fs from "fs";
import { BLANK_JSON_DATA } from "../../tests/helpers/queries";

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

export const getParserData = (queryId: string) => {
  const tracePath = getTracePath(queryId);
  const queryLogPath = getQueryLogPath(queryId);
  const viewLogPath = getViewLogPath(queryId);

  const trace =
    tracePath && fs.existsSync(tracePath)
      ? fs.readFileSync(tracePath, "utf-8")
      : "";
  const queryLog =
    queryLogPath && fs.existsSync(queryLogPath)
      ? fs.readFileSync(queryLogPath, "utf-8")
      : BLANK_JSON_DATA;
  const viewLog =
    viewLogPath && fs.existsSync(viewLogPath)
      ? fs.readFileSync(viewLogPath, "utf-8")
      : BLANK_JSON_DATA;

  return { trace, queryLog, viewLog };
};
