import { z } from "zod";

const STATUS_VALUES = ["pending", "paid", "failed", "expired"] as const;
const CHART_VARIANTS = ["bar", "line", "pie", "donut"] as const;

const bindStr = z.string().min(1).optional();

/** Template authoring schema   allows bind slots and empty placeholders. */
const templateMediaSchema = z.discriminatedUnion("kind", [
  z.object({
    type: z.literal("media"),
    kind: z.literal("url"),
    src: z.string().optional().default(""),
    alt: z.string().optional(),
    bindSrc: bindStr,
  }),
  z.object({
    type: z.literal("media"),
    kind: z.literal("dataUrl"),
    src: z.string().optional().default(""),
    alt: z.string().optional(),
    bindSrc: bindStr,
  }),
  z.object({
    type: z.literal("media"),
    kind: z.literal("payload"),
    payload: z.string().optional().default(""),
    encoding: z.enum(["raw", "base64"]).optional().default("raw"),
    mimeType: z.string().optional(),
    alt: z.string().optional(),
    bindPayload: bindStr,
    bindEncoding: bindStr,
  }),
]);

const templateTextSchema = z.object({
  type: z.literal("text"),
  content: z.string().optional().default(""),
  tone: z.enum(["default", "muted", "emphasis"]).optional(),
  bind: bindStr,
});

const templateKeyValueSchema = z.object({
  type: z.literal("keyValue"),
  rows: z.array(
    z.object({
      label: z.string(),
      value: z.string().optional().default(""),
      bind: bindStr,
    }),
  ),
});

const templateStatusSchema = z.object({
  type: z.literal("status"),
  value: z.enum(STATUS_VALUES).optional().default("pending"),
  label: z.string().optional(),
  bind: bindStr,
});

const templateTableSchema = z.object({
  type: z.literal("table"),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  bindRows: bindStr,
});

const templateButtonGroupSchema = z.object({
  type: z.literal("buttonGroup"),
  buttons: z.array(
    z.object({
      actionId: z.string().min(1),
      label: z.string().min(1),
    }),
  ),
});

const templateMetricSchema = z.object({
  type: z.literal("metric"),
  label: z.string().optional().default(""),
  value: z.string().optional().default(""),
  unit: z.string().optional(),
  bind: bindStr,
  bindLabel: bindStr,
});

const templateMetricGridSchema = z.object({
  type: z.literal("metricGrid"),
  columns: z.union([z.literal(2), z.literal(3)]).optional().default(2),
  items: z.array(
    z.object({
      label: z.string().optional().default(""),
      value: z.string().optional().default(""),
      unit: z.string().optional(),
      bind: bindStr,
    }),
  ),
});

const templateProgressSchema = z.object({
  type: z.literal("progress"),
  label: z.string().optional(),
  value: z.number().optional().default(0),
  max: z.number().optional().default(100),
  bind: bindStr,
  bindMax: bindStr,
});

const templateDividerSchema = z.object({
  type: z.literal("divider"),
});

const templateChartSeriesItemSchema = z.object({
  label: z.string(),
  value: z.number(),
});

const templateChartSchema = z.object({
  type: z.literal("chart"),
  variant: z.enum(CHART_VARIANTS).optional().default("bar"),
  title: z.string().optional(),
  series: z.array(templateChartSeriesItemSchema).optional().default([]),
  bindSeries: bindStr,
});

type TemplateNode =
  | z.infer<typeof templateTextSchema>
  | z.infer<typeof templateKeyValueSchema>
  | z.infer<typeof templateStatusSchema>
  | z.infer<typeof templateMediaSchema>
  | z.infer<typeof templateTableSchema>
  | z.infer<typeof templateButtonGroupSchema>
  | z.infer<typeof templateMetricSchema>
  | z.infer<typeof templateMetricGridSchema>
  | z.infer<typeof templateProgressSchema>
  | z.infer<typeof templateDividerSchema>
  | z.infer<typeof templateChartSchema>
  | { type: "stack"; children: TemplateNode[] }
  | { type: "card"; children: TemplateNode[]; title?: string };

export const uiTemplateNodeSchema: z.ZodType<TemplateNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    templateTextSchema,
    templateKeyValueSchema,
    templateStatusSchema,
    templateMediaSchema,
    templateTableSchema,
    templateButtonGroupSchema,
    templateMetricSchema,
    templateMetricGridSchema,
    templateProgressSchema,
    templateDividerSchema,
    templateChartSchema,
    z.object({
      type: z.literal("stack"),
      children: z.array(uiTemplateNodeSchema),
    }),
    z.object({
      type: z.literal("card"),
      title: z.string().optional(),
      children: z.array(uiTemplateNodeSchema),
    }),
  ]),
);

export const uiTemplateDefinitionSchema = z.object({
  version: z.literal(1),
  root: uiTemplateNodeSchema,
});

/** Runtime payload after binds are resolved (no bind keys). */
const runtimeMediaSchema = z.discriminatedUnion("kind", [
  z.object({
    type: z.literal("media"),
    kind: z.literal("url"),
    src: z.string().min(1),
    alt: z.string().optional(),
  }),
  z.object({
    type: z.literal("media"),
    kind: z.literal("dataUrl"),
    src: z.string().min(1),
    alt: z.string().optional(),
  }),
  z.object({
    type: z.literal("media"),
    kind: z.literal("payload"),
    payload: z.string().min(1),
    encoding: z.enum(["raw", "base64"]),
    mimeType: z.string().optional(),
    alt: z.string().optional(),
  }),
]);

type RuntimeNode =
  | {
      type: "text";
      content: string;
      tone?: "default" | "muted" | "emphasis";
    }
  | {
      type: "keyValue";
      rows: Array<{ label: string; value: string }>;
    }
  | {
      type: "status";
      value: (typeof STATUS_VALUES)[number];
      label?: string;
    }
  | z.infer<typeof runtimeMediaSchema>
  | { type: "table"; headers: string[]; rows: string[][] }
  | {
      type: "buttonGroup";
      buttons: Array<{ actionId: string; label: string }>;
    }
  | {
      type: "metric";
      label: string;
      value: string;
      unit?: string;
    }
  | {
      type: "metricGrid";
      columns?: 2 | 3;
      items: Array<{ label: string; value: string; unit?: string }>;
    }
  | {
      type: "progress";
      label?: string;
      value: number;
      max: number;
    }
  | { type: "divider" }
  | {
      type: "chart";
      variant: (typeof CHART_VARIANTS)[number];
      title?: string;
      series: Array<{ label: string; value: number }>;
    }
  | { type: "stack"; children: RuntimeNode[] }
  | { type: "card"; children: RuntimeNode[]; title?: string };

export const uiRuntimeNodeSchema: z.ZodType<RuntimeNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("text"),
      content: z.string(),
      tone: z.enum(["default", "muted", "emphasis"]).optional(),
    }),
    z.object({
      type: z.literal("keyValue"),
      rows: z.array(z.object({ label: z.string(), value: z.string() })),
    }),
    z.object({
      type: z.literal("status"),
      value: z.enum(STATUS_VALUES),
      label: z.string().optional(),
    }),
    runtimeMediaSchema,
    z.object({
      type: z.literal("table"),
      headers: z.array(z.string()),
      rows: z.array(z.array(z.string())),
    }),
    z.object({
      type: z.literal("buttonGroup"),
      buttons: z.array(
        z.object({
          actionId: z.string().min(1),
          label: z.string().min(1),
        }),
      ),
    }),
    z.object({
      type: z.literal("metric"),
      label: z.string(),
      value: z.string(),
      unit: z.string().optional(),
    }),
    z.object({
      type: z.literal("metricGrid"),
      columns: z.union([z.literal(2), z.literal(3)]).optional(),
      items: z.array(
        z.object({
          label: z.string(),
          value: z.string(),
          unit: z.string().optional(),
        }),
      ),
    }),
    z.object({
      type: z.literal("progress"),
      label: z.string().optional(),
      value: z.number(),
      max: z.number(),
    }),
    z.object({
      type: z.literal("divider"),
    }),
    z.object({
      type: z.literal("chart"),
      variant: z.enum(CHART_VARIANTS),
      title: z.string().optional(),
      series: z.array(
        z.object({
          label: z.string(),
          value: z.number(),
        }),
      ),
    }),
    z.object({
      type: z.literal("stack"),
      children: z.array(uiRuntimeNodeSchema),
    }),
    z.object({
      type: z.literal("card"),
      title: z.string().optional(),
      children: z.array(uiRuntimeNodeSchema),
    }),
  ]),
);

export const uiRuntimeDescSchema = z.object({
  version: z.literal(1),
  root: uiRuntimeNodeSchema,
});

export type UiTemplateDefinition = z.infer<typeof uiTemplateDefinitionSchema>;
export type UiRuntimeDesc = z.infer<typeof uiRuntimeDescSchema>;

export function parseUiTemplateDefinition(input: unknown) {
  return uiTemplateDefinitionSchema.safeParse(input);
}

export function parseUiRuntimeDesc(input: unknown) {
  return uiRuntimeDescSchema.safeParse(input);
}

export function collectBindNames(node: unknown, out = new Set<string>()): Set<string> {
  if (!node || typeof node !== "object") return out;
  const record = node as Record<string, unknown>;
  for (const key of [
    "bind",
    "bindSrc",
    "bindPayload",
    "bindEncoding",
    "bindLabel",
    "bindMax",
    "bindSeries",
    "bindRows",
  ] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) out.add(value.trim());
  }
  if (Array.isArray(record.rows)) {
    for (const row of record.rows) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        const bind = (row as Record<string, unknown>).bind;
        if (typeof bind === "string" && bind.trim()) out.add(bind.trim());
      }
    }
  }
  if (Array.isArray(record.items)) {
    for (const item of record.items) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const bind = (item as Record<string, unknown>).bind;
        if (typeof bind === "string" && bind.trim()) out.add(bind.trim());
      }
    }
  }
  if (Array.isArray(record.children)) {
    for (const child of record.children) collectBindNames(child, out);
  }
  return out;
}
