import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * OpenAlex ids sometimes come as full URLs. Extract the trailing id segment
 * so comparisons stay consistent everywhere.
 */
export const normalizeOpenAlexId = (raw?: string | null) => {
  if (!raw) return "";

  const trimmed = String(raw).trim();
  if (!trimmed) return "";

  const parts = trimmed.split("/");
  return parts[parts.length - 1] || trimmed;
};

type WorkLike = {
  workId?: string | null;
  doi?: string | null;
  title?: string | null;
  year?: number | null;
};

/**
 * Build a stable key for a work so we can deduplicate rows that describe the
 * same OpenAlex record (for example, when multiple programs include it).
 */
export const makeWorkKey = (work?: WorkLike) => {
  if (!work) return "";
  const workId = work.workId?.trim();
  if (workId) return workId.toLowerCase();

  const doi = work.doi?.trim();
  if (doi) return doi.toLowerCase();

  const title = work.title?.trim().toLowerCase() || "";
  const year = work.year ?? "";
  if (title || year) return `${title}|${year}`;

  return "";
};

/**
 * Remove duplicate works while preserving order. Useful when the same work is
 * emitted once per program but we only want to count it once per author.
 */
export const dedupeWorks = <T extends WorkLike>(works: T[]) => {
  const seen = new Set<string>();
  const result: T[] = [];

  works.forEach((work, index) => {
    const key = makeWorkKey(work);
    const dedupeKey = key || `__unknown_${index}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    result.push(work);
  });

  return result;
};
