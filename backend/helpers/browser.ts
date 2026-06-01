import open from "open";

export async function openUrl(
  url: string,
  openImpl: typeof open = open,
): Promise<boolean> {
  try {
    await openImpl(url);
    return true;
  } catch {
    return false;
  }
}
