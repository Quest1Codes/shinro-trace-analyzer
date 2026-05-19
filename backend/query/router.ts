import express from "express";
import crypto from "crypto";
import {
  findBinary,
  setBinaryPath,
  getBinaryPath,
  executeQuery,
  querySystemTables,
  testConnection,
  invalidateCHClient,
} from "./clickhouse";
import {
  clickhouseKeychain,
  type CHCredential,
} from "../keychain/clickhouse_credential";

import { readdir, rm } from "fs/promises";
import fs from "fs";
import { getLogDirectory, LOG_DIR } from "../helpers/fs";
import {
  saveConnection,
  listConnections,
  listAllConnections,
  getConnection,
  deleteConnection,
  touchConnection,
} from "../db/index";

const router = express.Router();
var queriesList: Array<string> = [];

const REDACTED_PASSWORD = "********";

async function updateQueriesList() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  const files = await readdir(LOG_DIR, { withFileTypes: true });
  queriesList = files
    .filter((file) => file.isDirectory())
    .map((dir) => dir.name);
}

// Initial population of queries list
updateQueriesList();

router.get("/find-clickhouse-binary", async (_req: any, res: any) => {
  try {
    const path = await findBinary();
    return res.json(path ? { found: true, path } : { found: false });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/update-clickhouse-path", async (req: any, res: any) => {
  const { path } = req.body;
  if (!path || typeof path !== "string") {
    return res.status(400).json({ error: "path is required" });
  }
  try {
    await setBinaryPath(path);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

router.get("/credentials", async (_req: any, res: any) => {
  let active = clickhouseKeychain.getActiveCredential();
  if (active) {
    active.password = REDACTED_PASSWORD;
  }
  const all = await clickhouseKeychain.getAllCredentialsRedacted();

  return res.json({
    configured: active != null,
    active: active,
    saved: all,
  });
});

router.post("/credentials", async (req: any, res: any) => {
  const { url, user, password, port, secure } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url is required" });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res
        .status(400)
        .json({ error: "URL must use http or https protocol" });
    }
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  const credential = {
    url,
    user: typeof user === "string" && user ? user : "default",
    password: typeof password === "string" ? password : "",
    port: typeof port === "string" ? port : parsed.port || undefined,
    secure: typeof secure === "boolean" ? secure : parsed.protocol === "https:",
  } as CHCredential;

  await clickhouseKeychain.upsertCredential(credential);
  clickhouseKeychain.setActiveCredential(credential);
  await invalidateCHClient(); // Force re-authentication on next query execution

  return res.json({ success: true });
});

router.delete("/credentials", async (req: any, res: any) => {
  try {
    const { user, url } = req.body ?? {};
    if (user && typeof user === "string" && url && typeof url === "string") {
      // Delete a specific saved credential
      await clickhouseKeychain.deleteCredential(user, url);
    } else {
      // Delete the currently active credential
      const active = clickhouseKeychain.getActiveCredential();
      if (!active) {
        return res
          .status(404)
          .json({ error: "No active credential to delete." });
      }
      await clickhouseKeychain.deleteCredential(active.user, active.url);
      clickhouseKeychain.unsetActiveCredential();
    }
    await invalidateCHClient(); // Force re-authentication on next query execution
    return res.json({ success: true, message: "Credential removed." });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/test-connection", async (req: any, res: any) => {
  const { url, user, password } = req.body;
  try {
    await testConnection(url, user, password);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message ?? "Unable to connect.",
    });
  }
});

router.post("/execute-query", async (req: any, res: any) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "query is required" });

  if (!getBinaryPath()) {
    return res.status(400).json({
      error:
        "ClickHouse binary not configured. Configure it on the connections page ",
    });
  }

  try {
    const queryID = await executeQuery(query);
    return res.json({ success: true, query_id: queryID });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/query-system-tables/:query_id", async (req: any, res: any) => {
  if (!clickhouseKeychain.getActiveCredential()) {
    return res.status(400).json({
      error: "ClickHouse credentials not configured. Call /credentials first.",
    });
  }

  try {
    await querySystemTables(req.params.query_id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/clear-logs/:query_id", async (req: any, res: any) => {
  // deletes the ~/.shinro/logs/{query_id} directory.
  const dir = getLogDirectory(req.params.query_id);
  if (!dir) {
    return res.json({ message: "No logs found for this query_id." });
  }
  await rm(dir, {
    recursive: true,
    force: true,
  });
  res.json({ message: "Logs cleared successfully" });
});

router.get("/clear-all-logs", async (req: any, res: any) => {
  // clears the ~/.shinro/logs/ directory entirely.
  await rm(LOG_DIR, {
    recursive: true,
    force: true,
  });
  res.json({ message: "All logs cleared successfully" });
});

router.get("/list-queries", async (req: any, res: any) => {
  try {
    await updateQueriesList();
    return res.json({ queries: queriesList });
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Failed to update queries", queries: queriesList });
  }
});

// ─── Connection Management (SQLite-backed) ───────────────

/**
 * GET /connections — List active (non-removed) connections.
 */
router.get("/connections", (_req: any, res: any) => {
  try {
    return res.json({ connections: listConnections() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /connections/all — List all connections including soft-deleted ones.
 * Used by the Query Editor dropdown to resolve historical cluster context.
 */
router.get("/connections/all", (_req: any, res: any) => {
  try {
    return res.json({ connections: listAllConnections() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /connections — Save a new connection.
 * Body: { cluster_id?, user_name, endpoint, password, skipTest? }
 * Password is stored in the macOS Keychain.
 */
router.post("/connections", async (req: any, res: any) => {
  const { cluster_id, user_name, endpoint, password, skipTest } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: "endpoint is required" });
  }

  const id =
    cluster_id ||
    crypto
      .createHash("sha256")
      .update(`${user_name || "default"}@${endpoint}`)
      .digest("hex")
      .slice(0, 16);
  try {
    const user = user_name || "default";
    const pass = password || "";
    // Test connection before saving (unless caller already validated)
    if (!skipTest) {
      await testConnection(endpoint, user, pass);
    }
    saveConnection(id, user, endpoint);
    // Persist credentials in the existing Keychain Credential[] store
    const parsed = new URL(endpoint);
    const credential = {
      url: endpoint,
      user,
      password: pass,
      port: parsed.port || undefined,
      secure: parsed.protocol === "https:",
    };
    await clickhouseKeychain.upsertCredential(credential);
    clickhouseKeychain.setActiveCredential(credential);
    return res.json({ success: true, cluster_id: id });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /connections/:cluster_id — Remove a connection.
 * Also removes the associated credential from the Keychain.
 */
router.delete("/connections/:cluster_id", async (req: any, res: any) => {
  try {
    const conn = getConnection(req.params.cluster_id);
    if (conn) {
      await clickhouseKeychain.deleteCredential(conn.user_name, conn.endpoint);
    }
    deleteConnection(req.params.cluster_id);
    clickhouseKeychain.unsetActiveCredential();
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /connections/:cluster_id/activate — Set as the active connection.
 */
router.post("/connections/:cluster_id/activate", async (req: any, res: any) => {
  const conn = getConnection(req.params.cluster_id);
  if (!conn) {
    return res.status(404).json({ error: "Connection not found" });
  }
  if (conn.is_removed) {
    return res.status(410).json({ error: "This connection has been removed" });
  }

  try {
    const found = await clickhouseKeychain.getCredentialFor(
      conn.user_name,
      conn.endpoint,
    );
    if (!found) {
      return res.status(404).json({
        error:
          "Credentials not found in keychain. Please re-add this connection.",
      });
    }
    clickhouseKeychain.setActiveCredential(found);
    await invalidateCHClient();
    touchConnection(conn.cluster_id);
    return res.json({
      success: true,
      user_name: conn.user_name,
      endpoint: conn.endpoint,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export { router as clickhouseRouter };
