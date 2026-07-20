// Run-length encoding for the compiled-map grids. A 3040² snow field collapses
// to a few kilobytes; worst-case noise degrades gracefully to ~2 chars/tile.
// Format: "value:count" pairs joined by commas, row-major over the whole grid.

export function rleEncode(data: Uint8Array): string {
  if (data.length === 0) return '';
  const parts: string[] = [];
  let value = data[0];
  let count = 1;
  for (let i = 1; i < data.length; i++) {
    if (data[i] === value) { count++; continue; }
    parts.push(`${value}:${count}`);
    value = data[i];
    count = 1;
  }
  parts.push(`${value}:${count}`);
  return parts.join(',');
}

export function rleDecode(encoded: string, expectedLength: number): Uint8Array {
  const out = new Uint8Array(expectedLength);
  if (encoded === '') {
    if (expectedLength !== 0) throw new Error(`RLE: empty payload for length ${expectedLength}`);
    return out;
  }
  let pos = 0;
  for (const part of encoded.split(',')) {
    const sep = part.indexOf(':');
    const value = Number(part.slice(0, sep));
    const count = Number(part.slice(sep + 1));
    if (!Number.isInteger(value) || !Number.isInteger(count) || count <= 0)
      throw new Error(`RLE: malformed run "${part}"`);
    out.fill(value, pos, pos + count);
    pos += count;
  }
  if (pos !== expectedLength)
    throw new Error(`RLE: decoded ${pos} values, expected ${expectedLength}`);
  return out;
}
