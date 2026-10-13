/** Split plain text into overlapping chunks. */
export async function chunkPlainText(
  text: string,
  chunkSize = 2000,
  chunkOverlap = 200,
): Promise<string[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (chunkOverlap >= chunkSize) {
    throw new Error("chunkOverlap must be smaller than chunkSize");
  }

  if (trimmed.length <= chunkSize) {
    return [trimmed];
  }

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    const end = Math.min(start + chunkSize, trimmed.length);
    chunks.push(trimmed.slice(start, end));
    if (end >= trimmed.length) break;
    start = end - chunkOverlap;
  }
  return chunks;
}
