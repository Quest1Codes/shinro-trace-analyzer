const PINK = "\x1b[95m";
const BLUE = "\x1b[94m";
const CYAN = "\x1b[96m";
const GREEN = "\x1b[92m";
const YELLOW = "\x1b[93m";
const RED = "\x1b[91m";
const BOLD = "\x1b[1m";
const UNDERLINE = "\x1b[4m";
const END = "\x1b[0m";

const BASE = "    |--- ";

export function printPink(text: string) {
  console.log(`${PINK}${BASE}${text}${END}`);
}

export function printBlue(text: string) {
  console.log(`${BLUE}${BASE}${text}${END}`);
}

export function printCyan(text: string) {
  console.log(`${CYAN}${BASE}${text}${END}`);
}

export function printGreen(text: string) {
  console.log(`${GREEN}${BASE}${text}${END}`);
}

export function printYellow(text: string) {
  console.log(`${YELLOW}${BASE}${text}${END}`);
}

export function printRed(text: string) {
  console.log(`${RED}${BASE}${text}${END}`);
}

export function formatBold(text: string): string {
  return `${BOLD}${text}${END}`;
}

export function formatUnderline(text: string): string {
  return `${UNDERLINE}${text}${END}`;
}
