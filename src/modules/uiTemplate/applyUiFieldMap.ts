import {
  collectBindNames,
  parseUiRuntimeDesc,
  type UiRuntimeDesc,
  type UiTemplateDefinition,
} from "../../utils/uiDescSchema";
import { resolveRecordField } from "./tableHeaderBind";

function getByPath(root: unknown, path: string): unknown {
  const parts = path.split(".").filter((part) => part.length > 0);
  let current: unknown = root;
  for (const part of parts) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function coerceString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

const STATUS_SET = new Set(["pending", "paid", "failed", "expired"]);

function coerceStatus(
  value: unknown,
): "pending" | "paid" | "failed" | "expired" | null {
  const raw = coerceString(value).trim().toLowerCase();
  if (STATUS_SET.has(raw)) {
    return raw as "pending" | "paid" | "failed" | "expired";
  }
  return null;
}

function resolveMediaFromString(value: string): {
  kind: "url" | "dataUrl" | "payload";
  src?: string;
  payload?: string;
  encoding?: "raw" | "base64";
} {
  const trimmed = value.trim();
  if (trimmed.startsWith("data:")) {
    return { kind: "dataUrl", src: trimmed };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { kind: "url", src: trimmed };
  }
  return { kind: "payload", payload: trimmed, encoding: "raw" };
}

type AnyNode = Record<string, unknown>;

function applyChildren(
  children: unknown[],
  fieldMap: Record<string, string>,
  toolResult: unknown,
): unknown[] {
  return children
    .map((child) => applyNode(child, fieldMap, toolResult))
    .filter((child) => child != null);
}

/**
 * Apply fieldMap onto a template node. Returns null to omit the node
 * (unmapped bind-only rows, empty media placeholders, empty containers).
 */
function applyNode(
  node: unknown,
  fieldMap: Record<string, string>,
  toolResult: unknown,
): unknown | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return node;
  const source = node as AnyNode;
  const type = source.type;

  if (type === "stack" || type === "card") {
    const children = Array.isArray(source.children)
      ? applyChildren(source.children, fieldMap, toolResult)
      : [];
    if (children.length === 0) return null;
    const next: AnyNode = { type, children };
    if (type === "card" && typeof source.title === "string") {
      next.title = source.title;
    }
    return next;
  }

  if (type === "text") {
    const bind = typeof source.bind === "string" ? source.bind.trim() : "";
    if (bind && !fieldMap[bind]) {
      // Bound text not mapped   omit from "only mapped" UI.
      return null;
    }
    const next: AnyNode = {
      type: "text",
      content: typeof source.content === "string" ? source.content : "",
    };
    if (typeof source.tone === "string") next.tone = source.tone;
    if (bind && fieldMap[bind]) {
      next.content = coerceString(getByPath(toolResult, fieldMap[bind]));
    }
    return next;
  }

  if (type === "keyValue") {
    const rowsIn = Array.isArray(source.rows) ? source.rows : [];
    const rows: Array<{ label: string; value: string }> = [];
    for (const row of rowsIn) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const r = row as AnyNode;
      const bind = typeof r.bind === "string" ? r.bind.trim() : "";
      // Skip bind rows that were not mapped (show only mapped fields).
      if (bind && !fieldMap[bind]) continue;

      const out = {
        label: typeof r.label === "string" ? r.label : "",
        value: typeof r.value === "string" ? r.value : "",
      };
      if (bind && fieldMap[bind]) {
        out.value = coerceString(getByPath(toolResult, fieldMap[bind]));
      }
      rows.push(out);
    }
    if (rows.length === 0) return null;
    return { type: "keyValue", rows };
  }

  if (type === "status") {
    const bind = typeof source.bind === "string" ? source.bind.trim() : "";
    if (bind && !fieldMap[bind]) return null;
    const next: AnyNode = {
      type: "status",
      value:
        typeof source.value === "string" && STATUS_SET.has(source.value)
          ? source.value
          : "pending",
    };
    if (typeof source.label === "string") next.label = source.label;
    if (bind && fieldMap[bind]) {
      const status = coerceStatus(getByPath(toolResult, fieldMap[bind]));
      if (status) next.value = status;
    }
    return next;
  }

  if (type === "media") {
    const next: AnyNode = { type: "media", kind: source.kind };
    if (typeof source.alt === "string") next.alt = source.alt;

    const bindSrc =
      typeof source.bindSrc === "string" ? source.bindSrc.trim() : "";
    const bindPayload =
      typeof source.bindPayload === "string" ? source.bindPayload.trim() : "";
    const bindEncoding =
      typeof source.bindEncoding === "string"
        ? source.bindEncoding.trim()
        : "";

    if (bindSrc && !fieldMap[bindSrc] && bindPayload && !fieldMap[bindPayload]) {
      return null;
    }
    if (bindSrc && !fieldMap[bindSrc] && !bindPayload) return null;
    if (bindPayload && !fieldMap[bindPayload] && !bindSrc) return null;

    if (bindSrc && fieldMap[bindSrc]) {
      const resolved = resolveMediaFromString(
        coerceString(getByPath(toolResult, fieldMap[bindSrc])),
      );
      next.kind = resolved.kind;
      if (resolved.src) next.src = resolved.src;
      if (resolved.payload) {
        next.payload = resolved.payload;
        next.encoding = resolved.encoding ?? "raw";
      }
    } else if (bindPayload && fieldMap[bindPayload]) {
      const payload = coerceString(getByPath(toolResult, fieldMap[bindPayload]));
      next.kind = "payload";
      next.payload = payload;
      let encoding: "raw" | "base64" = "raw";
      if (bindEncoding && fieldMap[bindEncoding]) {
        const enc = coerceString(
          getByPath(toolResult, fieldMap[bindEncoding]),
        ).toLowerCase();
        if (enc === "base64" || enc === "raw") encoding = enc;
      } else if (source.encoding === "base64" || source.encoding === "raw") {
        encoding = source.encoding;
      }
      next.encoding = encoding;
      if (typeof source.mimeType === "string") next.mimeType = source.mimeType;
    } else {
      next.kind = source.kind;
      if (typeof source.src === "string") next.src = source.src;
      if (typeof source.payload === "string") next.payload = source.payload;
      if (source.encoding === "base64" || source.encoding === "raw") {
        next.encoding = source.encoding;
      }
      if (typeof source.mimeType === "string") next.mimeType = source.mimeType;
    }

    // Runtime schema requires non-empty src/payload   drop empty placeholders.
    if (next.kind === "url" || next.kind === "dataUrl") {
      if (typeof next.src !== "string" || !next.src.trim()) return null;
    } else if (next.kind === "payload") {
      if (typeof next.payload !== "string" || !next.payload.trim()) return null;
      if (next.encoding !== "raw" && next.encoding !== "base64") {
        next.encoding = "raw";
      }
    } else {
      return null;
    }
    return next;
  }

  if (type === "table") {
    const headers = Array.isArray(source.headers)
      ? source.headers.map((h) => (h == null ? "" : String(h)))
      : [];
    const bindRows =
      typeof source.bindRows === "string" ? source.bindRows.trim() : "";

    if (bindRows && !fieldMap[bindRows]) return null;

    let rows: string[][] = [];
    if (Array.isArray(source.rows)) {
      for (const row of source.rows) {
        if (!Array.isArray(row)) continue;
        rows.push(row.map((cell) => (cell == null ? "" : String(cell))));
      }
    }

    if (bindRows && fieldMap[bindRows]) {
      const raw = getByPath(toolResult, fieldMap[bindRows]);
      const coerced = coerceTableRows(raw, headers);
      if (!coerced || coerced.length === 0) return null;
      rows = coerced;
    }

    return { type: "table", headers, rows };
  }

  if (type === "buttonGroup") {
    const buttons = Array.isArray(source.buttons) ? source.buttons : [];
    if (buttons.length === 0) return null;
    return { type: "buttonGroup", buttons };
  }

  if (type === "divider") {
    return { type: "divider" };
  }

  if (type === "metric") {
    const bind = typeof source.bind === "string" ? source.bind.trim() : "";
    const bindLabel =
      typeof source.bindLabel === "string" ? source.bindLabel.trim() : "";
    if (bind && !fieldMap[bind]) return null;
    const next: AnyNode = {
      type: "metric",
      label: typeof source.label === "string" ? source.label : "",
      value: typeof source.value === "string" ? source.value : "",
    };
    if (typeof source.unit === "string" && source.unit) next.unit = source.unit;
    if (bind && fieldMap[bind]) {
      next.value = coerceString(getByPath(toolResult, fieldMap[bind]));
    }
    if (bindLabel && fieldMap[bindLabel]) {
      next.label = coerceString(getByPath(toolResult, fieldMap[bindLabel]));
    }
    return next;
  }

  if (type === "metricGrid") {
    const itemsIn = Array.isArray(source.items) ? source.items : [];
    const items: Array<{ label: string; value: string; unit?: string }> = [];
    for (const item of itemsIn) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as AnyNode;
      const bind = typeof row.bind === "string" ? row.bind.trim() : "";
      if (bind && !fieldMap[bind]) continue;
      const out: { label: string; value: string; unit?: string } = {
        label: typeof row.label === "string" ? row.label : "",
        value: typeof row.value === "string" ? row.value : "",
      };
      if (typeof row.unit === "string" && row.unit) out.unit = row.unit;
      if (bind && fieldMap[bind]) {
        out.value = coerceString(getByPath(toolResult, fieldMap[bind]));
      }
      items.push(out);
    }
    if (items.length === 0) return null;
    const next: AnyNode = { type: "metricGrid", items };
    if (source.columns === 2 || source.columns === 3) next.columns = source.columns;
    return next;
  }

  if (type === "progress") {
    const bind = typeof source.bind === "string" ? source.bind.trim() : "";
    const bindMax =
      typeof source.bindMax === "string" ? source.bindMax.trim() : "";
    if (bind && !fieldMap[bind]) return null;
    let value =
      typeof source.value === "number" && Number.isFinite(source.value)
        ? source.value
        : 0;
    let max =
      typeof source.max === "number" && Number.isFinite(source.max)
        ? source.max
        : 100;
    if (bind && fieldMap[bind]) {
      const raw = Number(getByPath(toolResult, fieldMap[bind]));
      if (Number.isFinite(raw)) value = raw;
    }
    if (bindMax && fieldMap[bindMax]) {
      const raw = Number(getByPath(toolResult, fieldMap[bindMax]));
      if (Number.isFinite(raw) && raw > 0) max = raw;
    }
    const next: AnyNode = { type: "progress", value, max };
    if (typeof source.label === "string" && source.label) next.label = source.label;
    return next;
  }

  if (type === "chart") {
    const bindSeries =
      typeof source.bindSeries === "string" ? source.bindSeries.trim() : "";
    if (bindSeries && !fieldMap[bindSeries]) return null;

    let series: Array<{ label: string; value: number }> = [];
    if (Array.isArray(source.series)) {
      for (const item of source.series) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const row = item as AnyNode;
        const label = typeof row.label === "string" ? row.label : "";
        const value =
          typeof row.value === "number" && Number.isFinite(row.value)
            ? row.value
            : Number(row.value);
        if (!Number.isFinite(value)) continue;
        series.push({ label, value });
      }
    }

    if (bindSeries && fieldMap[bindSeries]) {
      const raw = getByPath(toolResult, fieldMap[bindSeries]);
      const coerced = coerceChartSeries(raw);
      if (coerced) series = coerced;
    }

    if (series.length === 0) return null;
    const variant =
      source.variant === "line" ||
      source.variant === "pie" ||
      source.variant === "donut" ||
      source.variant === "bar"
        ? source.variant
        : "bar";
    const next: AnyNode = { type: "chart", variant, series };
    if (typeof source.title === "string" && source.title) next.title = source.title;
    return next;
  }

  return source;
}

function cellFromObject(
  record: Record<string, unknown>,
  header: string,
): string {
  const value = resolveRecordField(record, header);
  return value === undefined ? "" : coerceString(value);
}

function coerceTableRows(
  value: unknown,
  headers: string[],
): string[][] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const colCount = Math.max(headers.length, 1);
  const rows: string[][] = [];

  for (const item of value) {
    if (Array.isArray(item)) {
      const row = item.map((cell) => coerceString(cell));
      while (row.length < colCount) row.push("");
      rows.push(row.slice(0, colCount));
      continue;
    }
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      if (headers.length === 0) {
        const keys = Object.keys(record);
        rows.push(keys.map((key) => coerceString(record[key])));
        continue;
      }
      rows.push(headers.map((header) => cellFromObject(record, header)));
      continue;
    }
    rows.push([coerceString(item), ...Array(Math.max(colCount - 1, 0)).fill("")]);
  }

  return rows.length > 0 ? rows : null;
}

function coerceChartSeries(
  value: unknown,
): Array<{ label: string; value: number }> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const series: Array<{ label: string; value: number }> = [];
  for (let index = 0; index < value.length; index++) {
    const item = value[index];
    if (typeof item === "number" && Number.isFinite(item)) {
      series.push({ label: String(index + 1), value: item });
      continue;
    }
    if (Array.isArray(item) && item.length >= 2) {
      const label = coerceString(item[0]);
      const num = Number(item[1]);
      if (Number.isFinite(num)) series.push({ label: label || String(index + 1), value: num });
      continue;
    }
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const label = coerceString(
        record.label ?? record.name ?? record.key ?? String(index + 1),
      );
      const num = Number(record.value ?? record.count ?? record.y);
      if (Number.isFinite(num)) series.push({ label, value: num });
    }
  }
  return series.length > 0 ? series : null;
}

/**
 * Apply fieldMap (bindName -> dotted path in toolResult) onto a template
 * definition. Unmapped bind slots are omitted. Returns a runtime UiDesc.
 */
export function applyUiFieldMap(
  definition: UiTemplateDefinition | Record<string, unknown>,
  fieldMap: Record<string, string>,
  toolResult: unknown,
): UiRuntimeDesc {
  const root = (definition as { root?: unknown }).root;
  const version = (definition as { version?: unknown }).version;
  if (version !== 1 || root == null) {
    throw new Error("Invalid UI template definition");
  }

  const binds = collectBindNames(root);
  for (const key of Object.keys(fieldMap)) {
    if (!binds.has(key)) {
      continue;
    }
  }

  const appliedRoot = applyNode(structuredClone(root), fieldMap, toolResult);
  if (appliedRoot == null) {
    throw new Error("UI field map produced an empty description");
  }

  const applied = {
    version: 1 as const,
    root: appliedRoot,
  };

  const parsed = parseUiRuntimeDesc(applied);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? ` at ${issue.path.join(".")}` : "";
    throw new Error(
      `UI field map produced an invalid description${where}: ${
        issue?.message ?? "unknown"
      }`,
    );
  }
  return parsed.data;
}
