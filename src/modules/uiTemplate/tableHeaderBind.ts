/**
 * Table bindRows resolution: headers must map to object property keys.
 * LLM-authored labels like "Price/Month" must resolve to pricePerMonth.
 */

/** "Price per Month" → "pricePerMonth"; "Slug" → "slug". */
export function headerToKey(header: string): string {
  const parts = header
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  if (parts.length === 0) return header.trim();
  return parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/** "pricePerMonth" → "Price Per Month" (round-trips via headerToKey). */
export function keyToDisplayHeader(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function tokenizeIdent(value: string): string[] {
  return value
    .trim()
    .split(/[^a-zA-Z0-9]+|(?=[A-Z][a-z])|(?<=[a-z])(?=[A-Z])/)
    .map((part) => part.toLowerCase())
    .filter(Boolean);
}

/** Header tokens appear in order as prefixes of key tokens (price+month ⊆ pricePerMonth). */
export function headerTokensMatchKey(header: string, key: string): boolean {
  const headerTokens = tokenizeIdent(header);
  const keyTokens = tokenizeIdent(key);
  if (headerTokens.length === 0 || keyTokens.length === 0) return false;

  let keyIndex = 0;
  for (const token of headerTokens) {
    let found = false;
    while (keyIndex < keyTokens.length) {
      const candidate = keyTokens[keyIndex++];
      if (candidate === token || candidate.startsWith(token) || token.startsWith(candidate)) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/**
 * Direct property keys under an array path from flattened output paths.
 * e.g. paths plans.name, plans.pricePerMonth → ["name","pricePerMonth"] for "plans".
 */
export function leafPropertyKeysForArray(
  outputPaths: string[],
  arrayPath: string,
): string[] {
  const prefix = `${arrayPath}.`;
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const path of outputPaths) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (!rest || rest.includes(".")) continue;
    if (seen.has(rest)) continue;
    seen.add(rest);
    keys.push(rest);
  }
  return keys;
}

export function pickLeafKeyForHeader(
  header: string,
  leafKeys: string[],
  used: Set<string>,
): string | null {
  const trimmed = header.trim();
  if (!trimmed) return null;

  const exact = leafKeys.find((key) => !used.has(key) && key === trimmed);
  if (exact) return exact;

  const camel = headerToKey(trimmed);
  const camelHit = leafKeys.find((key) => !used.has(key) && key === camel);
  if (camelHit) return camelHit;

  const lower = trimmed.toLowerCase();
  const lowerHit = leafKeys.find(
    (key) => !used.has(key) && key.toLowerCase() === lower,
  );
  if (lowerHit) return lowerHit;

  const fuzzy = leafKeys.filter(
    (key) => !used.has(key) && headerTokensMatchKey(trimmed, key),
  );
  if (fuzzy.length === 1) return fuzzy[0]!;
  if (fuzzy.length > 1) {
    // Prefer shortest key (Active → isActive over isDefaultPlan if both matched poorly)
    fuzzy.sort((a, b) => a.length - b.length);
    return fuzzy[0]!;
  }

  return null;
}

/**
 * Rewrite table headers so each column maps to a real leaf property under bindRows.
 * Mutates the template tree in place.
 */
export function normalizeTableHeadersInNode(
  node: unknown,
  outputPaths: string[],
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) normalizeTableHeadersInNode(child, outputPaths);
    return;
  }

  const record = node as Record<string, unknown>;
  if (record.type === "table") {
    const bindRows =
      typeof record.bindRows === "string" ? record.bindRows.trim() : "";
    if (bindRows) {
      const leafKeys = leafPropertyKeysForArray(outputPaths, bindRows);
      if (leafKeys.length > 0) {
        const rawHeaders = Array.isArray(record.headers)
          ? record.headers.map((h) => (h == null ? "" : String(h)))
          : [];
        const used = new Set<string>();
        const nextHeaders: string[] = [];

        for (const header of rawHeaders) {
          const key = pickLeafKeyForHeader(header, leafKeys, used);
          if (!key) continue;
          used.add(key);
          nextHeaders.push(keyToDisplayHeader(key));
        }

        // If the model invented unmatchable labels, fall back to schema leaves.
        if (nextHeaders.length === 0) {
          for (const key of leafKeys) {
            nextHeaders.push(keyToDisplayHeader(key));
          }
        }

        record.headers = nextHeaders;
        const colCount = nextHeaders.length;
        if (Array.isArray(record.rows)) {
          record.rows = record.rows.map((row) => {
            if (!Array.isArray(row)) {
              return Array.from({ length: colCount }, () => "");
            }
            const cells = row.map((cell) => (cell == null ? "" : String(cell)));
            while (cells.length < colCount) cells.push("");
            return cells.slice(0, colCount);
          });
        }
      }
    }
  }

  if (Array.isArray(record.children)) {
    for (const child of record.children) {
      normalizeTableHeadersInNode(child, outputPaths);
    }
  }
  if (Array.isArray(record.items)) {
    for (const item of record.items) {
      normalizeTableHeadersInNode(item, outputPaths);
    }
  }
}

/** Resolve a row object field from a table header label. */
export function resolveRecordField(
  record: Record<string, unknown>,
  header: string,
): unknown {
  if (Object.prototype.hasOwnProperty.call(record, header)) {
    return record[header];
  }
  const camel = headerToKey(header);
  if (camel && Object.prototype.hasOwnProperty.call(record, camel)) {
    return record[camel];
  }
  const lower = header.trim().toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === lower) return value;
  }

  const keys = Object.keys(record);
  const used = new Set<string>();
  const matched = pickLeafKeyForHeader(header, keys, used);
  if (matched && Object.prototype.hasOwnProperty.call(record, matched)) {
    return record[matched];
  }
  return undefined;
}
