// this is the entrypoint to the app.
import { startBackend } from "./backend";
import { execSync } from "child_process";
import { DEFAULT_PORT } from "./constants";

import {
  printBlue,
  printGreen,
  printPink,
  formatBold,
  formatUnderline,
} from "./utils";

/**
 * Opens a URL in the default browser using the platform-native command.
 *
 * The command differs per operating system: `open` on macOS, `start` on
 * Windows, and `xdg-open` on Linux. A failure to launch the browser (for
 * example, on a headless server) is non-fatal; the server keeps running and
 * the user can open the printed URL manually.
 *
 * @param url - The absolute URL to open.
 */
function openInBrowser(url: string): void {
  const openCmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    execSync(`${openCmd} ${url}`);
  } catch {
    printGreen(`Could not open a browser automatically. Visit ${url}`);
  }
}

let PORT = DEFAULT_PORT;
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
if (portArg) {
  const parsedPort = parseInt(portArg.split("=")[1], 10);
  if (!isNaN(parsedPort)) {
    PORT = parsedPort;
  }
}

process.env.PORT = PORT.toString();

async function main() {
  printPink(`SHINRO - Trace Analyzer`);
  console.log();
  printGreen(formatBold(`Started! Navigate to the URL below.`));
  printBlue(formatBold(formatUnderline(`http://localhost:${PORT}`)));

  printGreen("Redirecting in 3 seconds...");
  setTimeout(() => {
    openInBrowser(`http://localhost:${PORT}`);
  }, 3000);

  await Promise.all([startBackend(PORT)]);
}

main();
