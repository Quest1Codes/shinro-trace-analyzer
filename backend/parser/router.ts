import express from "express";
import { TraceParser } from "./parser";
const router = express.Router();
import { readFile } from "fs/promises";
import type { ParsedTraceResponse } from "./definitions";

import { getTracePath, getQueryLogPath, getViewLogPath } from "../helpers/fs";

router.get("/parse/:query_id", async (req: any, res: any) => {
  /*
  1. read the logs from ~/.shinro/logs
  2. parse the logs and extract relevant information
  3. return the parsed information as json response
   */

  const tracePath = getTracePath(req.params.query_id);
  const queryLogPath = getQueryLogPath(req.params.query_id);
  const viewLogPath = getViewLogPath(req.params.query_id);

  const trace = tracePath
    ? await readFile(tracePath, "utf-8").catch(() => "")
    : "";
  const query_log = queryLogPath
    ? await readFile(queryLogPath, "utf-8").catch(() => "{}")
    : "{}";
  const view_log = viewLogPath
    ? await readFile(viewLogPath, "utf-8").catch(() => "{}")
    : "{}";

  const parser = new TraceParser(trace, query_log, view_log);

  const metadata = parser.getMetadata();
  const tableIOStats = parser.getTableIOStats();
  const memoryTracking = parser.getMemoryTracking();
  const mvStats = parser.getMaterializedViewStats();
  const cascadeTree = parser.getMVCascadeTree();

  const response = {
    metadata: metadata,
    tableIOStats: tableIOStats,
    memoryTracking: memoryTracking,
    materializedViewStats: mvStats,
    mvCascadeTree: cascadeTree,
  } as ParsedTraceResponse;

  res.json(response);
});

export { router as parserRouter };
