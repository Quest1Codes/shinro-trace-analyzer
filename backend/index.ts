import express from "express";
import { DEFAULT_HOST, DEFAULT_PORT } from "../constants";
import cors from "cors";
import { clickhouseRouter } from "./query/router";
import { parserRouter } from "./parser/router";
import { aiRouter } from "./ai_controller/router";
import { handleMCPRequest } from "./mcp_server/index";
import { INDEX_HTML, FILES } from "../frontend/assets";

const app = express();

app.use(cors());

// Mount MCP server BEFORE express.json() so the MCP transport
// can parse its own JSON-RPC body with the correct content type handling
app.use("/mcp", handleMCPRequest as any);

app.use(express.json());

// CORS — allow the Vite dev server to reach us during development
app.use((req: any, res: any, next: any) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

const api = express.Router();

api.use("/query", clickhouseRouter);
api.use("/parser", parserRouter);
api.use("/ai", aiRouter);

api.get("/health", (req: any, res: any) => {
  res.send("Alive!");
});

app.use("/api", api);

function contentTypeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
      return "application/javascript";
    case "css":
      return "text/css";
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

// Serve embedded frontend files (e.g. "assets/abc.js", "logo/logo.svg", "favicon.svg")
app.get("/{*path}", (req: any, res: any) => {
  const key = (req.params.path as string[] | undefined)?.join("/") ?? "";
  if (key && Object.prototype.hasOwnProperty.call(FILES, key)) {
    res.setHeader("Content-Type", contentTypeFor(key));
    return res.send(FILES[key]);
  }
  // SPA fallback — serve index.html for all other non-API routes
  res.setHeader("Content-Type", "text/html");
  res.send(INDEX_HTML);
});

export function startBackend(port: number = DEFAULT_PORT, host: string = DEFAULT_HOST): Promise<void> {
  return new Promise((resolve) => {
    app.listen(port, host, () => {
      resolve();
    });
  });
}
