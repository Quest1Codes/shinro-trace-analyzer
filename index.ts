// this is the entrypoint to the app.
import open from "open";
import { startBackend } from "./backend";
import { DEFAULT_PORT } from "./constants";

import {
  printBlue,
  printGreen,
  printPink,
  formatBold,
  formatUnderline,
} from "./utils";

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
    void open(`http://localhost:${PORT}`).catch(() => {});
  }, 3000);

  await Promise.all([startBackend(PORT)]);
}

main();
