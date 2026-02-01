const MOJIBAKE_RE =
  /Ã.|Â.|â‚¬|â€”|â€“|â€|â€¢|â€¦|â„¢|\uFFFD|Ã¢|Ã¦|Ã¸|Ã¼|Ã¶|Ã¤|ÃŸ|Ã±|Ã²|Ã©|Ã¨|Ã |Ã‹|ÃŽ|Ã‡|Ãƒ/;

const mojibakeScore = (value) => {
  if (!value) return 0;
  let count = 0;
  value.replace(MOJIBAKE_RE, () => {
    count += 1;
    return "";
  });
  return count;
};

/**
 * Detect common UTF-8 -> Latin1 mojibake and repair safely.
 * Only applies the repair when it decreases mojibake markers to avoid double-decoding.
 */
const repairUtf8 = (value) => {
  if (value === undefined || value === null) return value;
  const str = String(value);
  if (!MOJIBAKE_RE.test(str)) return str;

  const repaired = Buffer.from(str, "latin1").toString("utf8");
  return mojibakeScore(repaired) <= mojibakeScore(str) ? repaired : str;
};

module.exports = {
  repairUtf8,
};
