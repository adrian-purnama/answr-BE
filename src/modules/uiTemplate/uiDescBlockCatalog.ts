/**
 * Shared UiDesc node catalog for LLM prompts (runtime auto UI + AI Create templates).
 */

export function uiDescBlockCatalogPrompt(): string {
  return (
    "Allowed UiNode types (use ONLY these):\n" +
    "- card: { type:\"card\", title?, children }\n" +
    "- stack: { type:\"stack\", children }\n" +
    "- text: { type:\"text\", content, tone?: \"default\"|\"muted\"|\"emphasis\", bind? }\n" +
    "- keyValue: { type:\"keyValue\", rows: [{ label, value, bind? }] }\n" +
    "- status: { type:\"status\", value: \"pending\"|\"paid\"|\"failed\"|\"expired\", label?, bind? }\n" +
    "- media: { type:\"media\", kind: \"url\"|\"dataUrl\"|\"payload\", src?|payload?, encoding?, alt?, bindSrc?, bindPayload? }\n" +
    "- table: { type:\"table\", headers: string[], rows: string[][], bindRows? }\n" +
    "- buttonGroup: { type:\"buttonGroup\", buttons: [{ actionId, label }] }\n" +
    "- metric: { type:\"metric\", label, value, unit?, bind?, bindLabel? }\n" +
    "- metricGrid: { type:\"metricGrid\", columns?: 2|3, items: [{ label, value, unit?, bind? }] }\n" +
    "- progress: { type:\"progress\", label?, value: number, max: number, bind?, bindMax? }\n" +
    "- divider: { type:\"divider\" }\n" +
    "- chart: { type:\"chart\", variant: \"bar\"|\"line\"|\"pie\"|\"donut\", title?, series: [{ label, value: number }], bindSeries? }\n" +
    "Rules:\n" +
    "- Root must be a card or stack.\n" +
    "- keyValue / table / metric / text string fields MUST be strings (coerce numbers/booleans).\n" +
    "- chart series values MUST be numbers.\n" +
    "- Prefer metric / metricGrid / keyValue / chart for statistics; table for tabular lists.\n" +
    "- Keep the card concise; do not invent fields that are absent from the source."
  );
}

export function runtimeAutoUiSystemPrompt(): string {
  return (
    "You turn MCP tool JSON results into a compact chat UI card.\n" +
    "Return ONLY a JSON object (no markdown fences) with this shape:\n" +
    '{ "version": 1, "root": <UiNode> }\n' +
    uiDescBlockCatalogPrompt() +
    "\nFill real values from the tool result. Do not include bind / bindSeries / bindRows / bindSrc / bindPayload / bindMax / bindLabel fields   this is a runtime card with concrete values."
  );
}

export function templateFromSchemaSystemPrompt(): string {
  return (
    "You design a reusable chat UI **template** for an MCP tool from its output JSON Schema paths.\n" +
    "Return ONLY a JSON object (no markdown fences) with this shape:\n" +
    '{ "version": 1, "root": <UiNode> }\n' +
    uiDescBlockCatalogPrompt() +
    "\nAuthoring rules:\n" +
    "- This is a TEMPLATE: put bind / bindSeries / bindRows on nodes so values can be mapped later.\n" +
    "- Use bind names that exactly match the provided output paths when possible (e.g. \"account.email\", \"plan.name\", \"plans\").\n" +
    "- Placeholder label/value strings may be empty or short examples; binds matter most.\n" +
    "- For arrays of objects, use table with bindRows pointing at the array path (e.g. \"plans\"), not leaf fields.\n" +
    "- CRITICAL for table headers: each header MUST round-trip to an exact leaf property under that array.\n" +
    "  Leaf path \"plans.pricePerMonth\" → header \"Price Per Month\" (or exact key \"pricePerMonth\").\n" +
    "  NEVER use shortened labels like \"Price/Month\", \"API Keys\", \"Active\" — those fail to bind.\n" +
    "  Correct examples: \"Price Per Month\", \"Max Api Keys\", \"Max Requests Per Minute\", \"Is Active\", \"Is Default Plan\".\n" +
    "- For arrays of stats, use chart with bindSeries pointing at the array path, or metricGrid with item binds.\n" +
    "- Do not invent output paths that are not listed.\n" +
    "- Prefer a card titled from the tool name."
  );
}
