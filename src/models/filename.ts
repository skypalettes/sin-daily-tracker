/**
 * Convert an arbitrary string (including Japanese) into a safe Obsidian
 * vault file name.
 *
 * Rules:
 *  - OS/Obsidian forbidden characters ( \ / : * ? " < > | ) → "-"
 *  - Leading/trailing whitespace and dots stripped
 *  - Consecutive spaces compressed to single space
 *  - Max 80 UTF-16 code units (Obsidian limit is much higher, but keeps
 *    file names readable in Explorer)
 *  - Falls back to the provided `fallback` string when result is empty
 *
 * Japanese, emoji, kanji, etc. are intentionally preserved.
 */
export function toSafeFileName(name: string, fallback = "file"): string {
  let safe = name
    // Replace forbidden characters with hyphen
    .replace(/[\\/:*?"<>|]/g, "-")
    // Compress consecutive whitespace
    .replace(/\s+/g, " ")
    // Strip leading/trailing whitespace and dots
    .replace(/^[\s.]+|[\s.]+$/g, "")
    // Truncate to 80 chars
    .slice(0, 80)
    // Strip again after truncation (might end with whitespace/dot)
    .replace(/[\s.]+$/, "");

  return safe || fallback;
}
