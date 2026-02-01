const MOJIBAKE_RE =
  /Ã.|Â.|â‚¬|â€”|â€“|â€|â€¢|â€¦|â„¢|\uFFFD|Ã¢|Ã¦|Ã¸|Ã¼|Ã¶|Ã¤|ÃŸ|Ã±|Ã²|Ã©|Ã¨|Ã |Ã‹|ÃŽ|Ã‡|Ãƒ/;

const mojibakeScore = (value: string) => {
  if (!value) return 0;
  let count = 0;
  value.replace(MOJIBAKE_RE, () => {
    count += 1;
    return "";
  });
  return count;
};

const decoder = new TextDecoder("utf-8");

const fromLatin1 = (value: string) => {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i) & 0xff;
  }
  return decoder.decode(bytes);
};

/**
 * Detect common UTF-8 -> Latin1 mojibake and repair safely.
 * Only applies the repair when it decreases mojibake markers to avoid double-decoding.
 */
export const repairUtf8 = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  const str = String(value);
  if (!MOJIBAKE_RE.test(str)) return str;

  const repaired = fromLatin1(str);
  return mojibakeScore(repaired) <= mojibakeScore(str) ? repaired : str;
};
