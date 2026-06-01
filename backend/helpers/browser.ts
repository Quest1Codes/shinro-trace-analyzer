import { execFileSync } from "child_process";

export interface BrowserOpenCommand {
  command: string;
  args: string[];
}

export function getBrowserOpenCommand(
  url: string,
  platform: NodeJS.Platform = process.platform,
): BrowserOpenCommand | null {
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }

  if (platform === "linux") {
    return { command: "xdg-open", args: [url] };
  }

  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }

  return null;
}

export function openUrl(
  url: string,
  platform: NodeJS.Platform = process.platform,
  execImpl: typeof execFileSync = execFileSync,
): boolean {
  const command = getBrowserOpenCommand(url, platform);
  if (!command) {
    return false;
  }

  try {
    execImpl(command.command, command.args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
