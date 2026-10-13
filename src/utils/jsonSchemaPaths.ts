/**
 * Flatten JSON Schema properties to dotted leaf paths (MCP output schemas).
 * Mirrors frontend/src/lib/jsonSchemaPaths.ts for backend generators.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function schemaBranches(def: unknown): Record<string, unknown>[] {
  const record = asRecord(def);
  if (!record) return [];

  const out: Record<string, unknown>[] = [];
  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    const arr = record[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const nested = schemaBranches(item);
      if (nested.length > 0) out.push(...nested);
      else {
        const branch = asRecord(item);
        if (branch) out.push(branch);
      }
    }
  }
  if (out.length > 0) return out;
  return [record];
}

function objectSchemaWithProperties(
  def: unknown,
): Record<string, unknown> | null {
  for (const branch of schemaBranches(def)) {
    const props = branch.properties;
    if (props && typeof props === "object" && !Array.isArray(props)) {
      return branch;
    }
    if (branch.items) {
      for (const item of schemaBranches(branch.items)) {
        if (
          item.properties &&
          typeof item.properties === "object" &&
          !Array.isArray(item.properties)
        ) {
          return item;
        }
      }
    }
  }
  return null;
}

/** True when the schema (or a branch) describes an array. */
function isArraySchema(def: unknown): boolean {
  for (const branch of schemaBranches(def)) {
    if (branch.type === "array" || branch.items != null) return true;
  }
  return false;
}

export function flattenJsonSchemaPaths(
  schema: unknown,
  prefix = "",
  maxDepth = 6,
): string[] {
  if (maxDepth < 0) return [];

  const root = objectSchemaWithProperties(schema) ?? asRecord(schema);
  if (!root) return [];

  const properties = root.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return [];
  }

  const paths: string[] = [];
  for (const [key, def] of Object.entries(
    properties as Record<string, unknown>,
  )) {
    if (!key) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const nestedObject = objectSchemaWithProperties(def);

    if (nestedObject?.properties) {
      const childPaths = flattenJsonSchemaPaths(nestedObject, path, maxDepth - 1);
      if (childPaths.length > 0) {
        // Emit array path for table bindRows / chart bindSeries mapping.
        if (isArraySchema(def)) {
          paths.push(path);
        }
        paths.push(...childPaths);
        continue;
      }
    }

    paths.push(path);
  }

  return paths;
}
