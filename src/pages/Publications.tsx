import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpDown,
  Download,
  Linkedin,
  Link as LinkIcon,
  FileText,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SiteShell } from "@/components/SiteShell";
import { worksTable } from "@/data/worksTable.generated";   // <- keep this one
import { filterWorks } from "@/lib/blacklist";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { repairUtf8 } from "@/lib/textRepair";
import insightsConfig from "../../data/config/insightsconfig.json";
import venueTypeOverridesCsv from "../../data/config/venue-type-overrides.csv?raw";

type PublicationSortField =
  | "title"
  | "firstAuthor"
  | "year"
  | "topics"
  | "institutions"
  | "venue"
  | "citations";

const getPublicationSortValue = (field: PublicationSortField, w: (typeof worksTable)[number]) => {
  if (field === "year") {
    if (w.publicationDate) {
      const t = Date.parse(w.publicationDate);
      if (!Number.isNaN(t)) return t;
    }
    return w.year ?? 0;
  }
  if (field === "citations") return w.citations ?? 0;
  if (field === "venue") return (w.venue || "").toLowerCase();
  if (field === "topics") return (w.topics || []).join(", ").toLowerCase();
  if (field === "institutions") return (w.institutions || []).join(", ").toLowerCase();
  if (field === "firstAuthor") {
    const first = (w.allAuthors || [])[0] || "";
    const last =
      w.firstAuthorLastName ||
      (first ? first.split(/\s+/).filter(Boolean).slice(-1)[0] : "");
    return (last || first).toLowerCase();
  }
  const title = (w.title || "").replace(/<[^>]+>/g, " ").trim();
  return title.toLowerCase();
};
const getPublicationTooltip = (w: (typeof worksTable)[number]) => {
  if (!w.publicationDate) return "";
  const t = Date.parse(w.publicationDate);
  if (Number.isNaN(t)) return w.publicationDate;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const defaultYearRangeConfig =
  (insightsConfig as {
    defaultYearRangePages?: { from?: number | null; to?: number | null };
    defaultYearRange?: { from?: number | null; to?: number | null };
  })?.defaultYearRangePages ||
  (insightsConfig as { defaultYearRange?: { from?: number | null; to?: number | null } })
    ?.defaultYearRange ||
  {};

const formatPublicationDate = (w: (typeof worksTable)[number]) => {
  if (w.publicationDate) {
    const t = Date.parse(w.publicationDate);
    if (!Number.isNaN(t)) {
      return new Date(t).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    return w.publicationDate;
  }
  return w.year ? String(w.year) : "";
};

const renderTitleHtml = (title: string | undefined) => (
  <span dangerouslySetInnerHTML={{ __html: title || "" }} />
);

const formatFirstAuthor = (authors: string[] | undefined, firstAuthorLastName?: string) => {
  if (!authors?.length) return "";
  const baseName = firstAuthorLastName || authors[0];
  return authors.length > 1 && baseName ? `${baseName} et al.` : baseName;
};

// Normalize DOIs so duplicates can be detected reliably
const normalizeDoi = (raw?: string | null) => {
  if (!raw) return "";
  let doi = raw.trim().toLowerCase();
  doi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  doi = doi.replace(/^doi:/, "");
  return doi.trim();
};

// Normalize names so minor differences (case, hyphen variants, accents)
// don't split the same person into multiple buckets.
const normalizeName = (raw: string) => {
  if (!raw) return "";
  let s = raw.trim().toLowerCase();

  // Unicode normalization: remove diacritics
  s = s.normalize("NFD").replace(/\p{M}+/gu, "");

  // Unify dash / hyphen variants
  s = s.replace(/[\u2010-\u2015]/g, "-");

  // Remove punctuation that shouldn't affect identity
  s = s.replace(/[.,']/g, "");

  // Collapse whitespace
  s = s.replace(/\s+/g, " ");

  return s;
};

const namesRoughlyMatch = (left: string, right: string) => {
  // Repair potential mojibake before normalization
  const cleanInput = (value: string) => repairUtf8(value || "");

  const firstLast = (value: string) => {
    const cleaned = cleanInput(value);
    if (!cleaned) return { first: "", last: "" };
    const hadComma = cleaned.includes(",");
    const norm = normalizeName(cleaned);
    const tokens = norm.split(" ").filter(Boolean);
    if (!tokens.length) return { first: "", last: "" };

    if (hadComma) {
      // Assume "Last, First Middle"
      const commaParts = cleaned.split(",");
      const leftPart = normalizeName(commaParts[0] || "");
      const rightPart = normalizeName(commaParts.slice(1).join(" ") || "");
      const rightTokens = rightPart.split(" ").filter(Boolean);
      const leftTokens = leftPart.split(" ").filter(Boolean);
      const first = rightTokens[0] || tokens[0];
      const last = leftTokens[leftTokens.length - 1] || tokens[tokens.length - 1];
      return { first, last };
    }

    return { first: tokens[0], last: tokens[tokens.length - 1] };
  };

  const a = firstLast(left);
  const b = firstLast(right);
  return !!a.first && !!a.last && a.first === b.first && a.last === b.last;
};

const ALL = "all";
const PAGE_SIZE = 15;

interface PublicationsPageProps {
  mode?: "publications" | "citations";
}

const PublicationsPage = ({ mode = "publications" }: PublicationsPageProps) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const topicFilter = params.get("topic") || "";
  const institutionFilter = params.get("institution") || "";
  const authorFilter = params.get("author") || "";
  const authorIdFilter = params.get("authorId") || "";
  const coAuthorFilter = params.get("coauthor") || "";
  const venueFilter = params.get("venue") || "";
  const fromYearParam = params.get("fromYear");
  const toYearParam = params.get("toYear");
  const [sortBy, setSortBy] = useState<PublicationSortField>(
    mode === "citations" ? "citations" : "year",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");
  const [venueTypeFilter, setVenueTypeFilter] = useState<
    "all" | "journal" | "conference" | "other"
  >("all");

  const allYears = useMemo(() => {
    const years = new Set<number>();
    for (const w of worksTable) {
      if (w.year && w.year > 0) years.add(w.year);
    }
    return Array.from(years).sort((a, b) => a - b);
  }, []);

  const [startYear, setStartYear] = useState<number | null>(
    fromYearParam ? Number(fromYearParam) : null,
  );
  const [endYear, setEndYear] = useState<number | null>(
    toYearParam ? Number(toYearParam) : null,
  );

  useEffect(() => {
    if (!allYears.length) return;
    const fallbackStart = defaultYearRangeConfig.from ?? allYears[0];
    const fallbackEnd = defaultYearRangeConfig.to ?? allYears[allYears.length - 1];

    setStartYear((prev) => (prev == null ? fallbackStart : prev));
    setEndYear((prev) => (prev == null ? fallbackEnd : prev));
  }, [allYears, defaultYearRangeConfig.from, defaultYearRangeConfig.to]);


  const conferenceKeywords = [
    "conference",
    "proceedings",
    "symposium",
    "workshop",
    "congress",
    "meeting",
    "annual",
  ];

  const venueOverrides = useMemo(() => {
    const map = new Map<string, "journal" | "conference" | "other">();
    const splitCsvLine = (line: string) => {
      const match = line.match(/^\s*(?:"([^"]*)"|([^,]*))\s*,\s*(.+)\s*$/);
      if (!match) return null;
      const venue = (match[1] ?? match[2] ?? "").trim();
      const type = match[3]?.trim() ?? "";
      return venue && type ? [venue, type] : null;
    };
    const lines = (venueTypeOverridesCsv || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return map;
    const startIndex = lines[0].toLowerCase().startsWith("venue,") ? 1 : 0;
    for (let i = startIndex; i < lines.length; i += 1) {
      const parsed = splitCsvLine(lines[i]);
      if (!parsed) continue;
      const [venueRaw, typeRaw] = parsed;
      if (!venueRaw || !typeRaw) continue;
      const type = typeRaw.toLowerCase();
      if (type !== "journal" && type !== "conference" && type !== "other") continue;
      map.set(venueRaw.toLowerCase(), type as "journal" | "conference" | "other");
    }
    return map;
  }, []);

  const classifyVenueType = (venue: string | undefined) => {
    const v = (venue || "").trim().toLowerCase();
    if (!v) return "other" as const;
    const override = venueOverrides.get(v);
    if (override) return override;
    const isConference = conferenceKeywords.some((kw) => v.includes(kw));
    return isConference ? ("conference" as const) : ("journal" as const);
  };

  const baseFiltered = useMemo(() => {
    const baseWorks = filterWorks(worksTable);
    const from = startYear ?? (allYears.length ? allYears[0] : undefined);
    const to = endYear ?? (allYears.length ? allYears[allYears.length - 1] : undefined);

    const query = searchQuery.trim().toLowerCase();
    const seenDois = new Set<string>();

    return baseWorks.filter((w) => {
      if (!w.year) return false;
      if (from != null && w.year < from) return false;
      if (to != null && w.year > to) return false;
      if (topicFilter && !(w.topics || []).includes(topicFilter)) return false;
      if (institutionFilter && !(w.institutions || []).includes(institutionFilter))
        return false;
      if (
        venueFilter &&
        (w.venue || "").trim().toLowerCase() !== venueFilter.trim().toLowerCase()
      )
        return false;
      if (authorIdFilter) {
        if (!(w.allAuthorOpenAlexIds || []).includes(authorIdFilter)) return false;
      } else if (
        authorFilter &&
        !(w.allAuthors || []).some(
          (name) => namesRoughlyMatch(name, authorFilter),
        )
      ) {
        return false;
      }
      if (
        coAuthorFilter &&
        !(w.allAuthors || []).some(
          (name) => namesRoughlyMatch(name, coAuthorFilter),
        )
      ) {
        return false;
      }

      if (query) {
        const haystack = [
          w.title || "",
          w.venue || "",
          String(w.year ?? ""),
          (w.topics || []).join(" "),
          (w.institutions || []).join(" "),
          (w.allAuthors || []).join(" "), // allow searching by author names
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      // De‑duplicate by normalized DOI
      const doiKey = normalizeDoi(w.doi);
      if (doiKey) {
        if (seenDois.has(doiKey)) return false;
        seenDois.add(doiKey);
      }

      return true;
    });
  }, [
    startYear,
    endYear,
    allYears,
    searchQuery,
    topicFilter,
    institutionFilter,
    authorFilter,
    authorIdFilter,
    coAuthorFilter,
    venueFilter,
  ]);

  const filtered = useMemo(() => {
    if (venueTypeFilter === "all") return baseFiltered;
    return baseFiltered.filter((w) => classifyVenueType(w.venue) === venueTypeFilter);
  }, [baseFiltered, venueTypeFilter, venueOverrides]);

  const venueTypeCounts = useMemo(() => {
    const total = baseFiltered.length;
    let journals = 0;
    let conferences = 0;
    let others = 0;
    baseFiltered.forEach((w) => {
      const type = classifyVenueType(w.venue);
      if (type === "journal") journals += 1;
      else if (type === "conference") conferences += 1;
      else others += 1;
    });
    return { all: total, journal: journals, conference: conferences, other: others };
  }, [baseFiltered, venueOverrides]);


  const sorted = useMemo(() => {
    const items = [...filtered];
    items.sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;
      const av = getPublicationSortValue(sortBy, a);
      const bv = getPublicationSortValue(sortBy, b);
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
    return items;
  }, [filtered, sortBy, sortOrder]);

  const visibleRows = sorted.slice(0, visibleCount);
  const hasMoreToShow = visibleCount < sorted.length;

  const toggleSort = (field: PublicationSortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "year" || field === "citations" ? "desc" : "asc");
      setVisibleCount(PAGE_SIZE);
    }
  };

  const title =
    mode === "citations" ? "Publications by citations" : "Publications";

  const handleSavePdf = () => {
    window.print();
  };

  const handleShareLinkedIn = () => {
    const url = window.location.href;
    const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
      url,
    )}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copied",
        description: "Publications page URL copied to clipboard.",
      });
    } catch {
      // ignore
    }
  };


  const handleExportCsv = () => {
    if (!sorted.length) return;

    const clean = (value: unknown) => repairUtf8(value ?? "");

    const headers = [
      "title",
      "authors",
      "year",
      "topics",
      "institutions",
      "venue",
      "citations",
      "citation_harvard",
    ];

    const escape = (value: unknown) => {
      const str = clean(value);
      if (str === "") return "";
      const cleaned = str.replace(/\r?\n/g, " ");
      if (/[",]/.test(cleaned)) {
        return `"${cleaned.replace(/"/g, '""')}"`;
      }
      return cleaned;
    };

    const decodeHtmlEntities = (value: string) => {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = value;
      return textarea.value;
    };

    const getExportYear = (w: (typeof worksTable)[number]) => {
      if (w.publicationDate) {
        const d = new Date(w.publicationDate);
        if (!Number.isNaN(d.getTime())) return d.getFullYear();
      }
      return w.year ?? "";
    };

    const formatHarvardCitation = (w: (typeof worksTable)[number]) => {
      const sanitizeText = (value: string) =>
        clean(value)
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      const authors = (w.allAuthors || []).map((name) => sanitizeText(name));

      const formatInitials = (name: string) =>
        name
          .split(/[\s-]+/)
          .filter(Boolean)
          .map((part) => `${part[0]?.toUpperCase() || ""}.`)
          .join("");

      const formattedAuthors = authors
        .map((fullName) => {
          const parts = fullName.trim().split(/\s+/);
          if (!parts.length) return "";
          const last = parts.pop() || "";
          const initials = formatInitials(parts.join(" "));
          const cleanLast = last.replace(/[,]+/g, "");
          return initials ? `${cleanLast}, ${initials}` : cleanLast;
        })
        .filter(Boolean);

      let authorsPart = "";
      if (formattedAuthors.length === 1) {
        authorsPart = formattedAuthors[0];
      } else if (formattedAuthors.length === 2) {
        authorsPart = `${formattedAuthors[0]} and ${formattedAuthors[1]}`;
      } else if (formattedAuthors.length > 2) {
        authorsPart = `${formattedAuthors.slice(0, -1).join(", ")}, and ${
          formattedAuthors[formattedAuthors.length - 1]
        }`;
      }

      const titlePart = sanitizeText(decodeHtmlEntities(w.title || ""));
      const yearPart = getExportYear(w);
      const venuePart = w.venue ? `${sanitizeText(w.venue)}.` : "";
      const doiPart = w.doi
        ? `doi:${clean(w.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`
        : "";

      return [
        authorsPart ? `${authorsPart},` : "",
        yearPart ? `${yearPart}.` : "",
        titlePart ? `${titlePart}.` : "",
        venuePart,
        doiPart,
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    };

    const lines = [headers.join(",")];

    for (const w of sorted) {
      lines.push(
        [
          decodeHtmlEntities(clean(w.title || "")),
          (w.allAuthors || []).map((name) => clean(name)).join("; "),
          getExportYear(w),
          (w.topics || []).map((t) => clean(t)).join("; "),
          (w.institutions || []).map((i) => clean(i)).join("; "),
          clean(w.venue || ""),
          w.citations ?? "",
          formatHarvardCitation({
            ...w,
            title: decodeHtmlEntities(clean(w.title || "")),
          }),
        ]
          .map(escape)
          .join(","),
      );
    }

    // Prepend BOM so Excel consistently opens the file as UTF-8
    const csv = `\uFEFF${lines.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download =
      mode === "citations" ? "publications-by-citations.csv" : "publications.csv";
    a.click();

    URL.revokeObjectURL(url);
  };

  return (
    <SiteShell>
      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="px-2 text-xs"
          >
            Back to previous
          </Button>
        </div>

        <Card className="border-border/60">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle>{title}</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleSavePdf}
                  title="Save PDF"
                >
                  <Download className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleExportCsv}
                  title="Export CSV"
                >
                  <FileText className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleShareLinkedIn}
                  title="Share on LinkedIn"
                >
                  <Linkedin className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleCopyLink}
                  title="Copy link"
                >
                  <LinkIcon className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-md">
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  placeholder="Search title, venue, topic..."
                  className="h-8 pl-7 pr-2 text-xs"
                />
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="flex flex-wrap items-center justify-end gap-3 mb-3 text-[11px] text-muted-foreground">
              {allYears.length > 0 && (
                <>
                  <span className="font-semibold text-foreground">Year range:</span>
                  <select
                    className="h-7 rounded border border-border bg-background px-2 text-xs"
                    value={startYear ?? ""}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setStartYear(value);
                      if (endYear != null && value > endYear) setEndYear(value);
                    }}
                  >
                    {allYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <span>to</span>
                  <select
                    className="h-7 rounded border border-border bg-background px-2 text-xs"
                    value={endYear ?? ""}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setEndYear(value);
                      if (startYear != null && value < startYear) setStartYear(value);
                    }}
                  >
                    {allYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">Venue type</span>
                {(["all", "journal", "conference", "other"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`h-7 text-[11px] ${
                      venueTypeFilter === value
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200"
                    }`}
                    onClick={() => {
                      setVenueTypeFilter(value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    aria-pressed={venueTypeFilter === value}
                  >
                    {value === "all"
                      ? "All"
                      : value === "journal"
                        ? "Journals"
                        : value === "conference"
                          ? "Conferences"
                          : "Others"}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({venueTypeCounts[value]})
                    </span>
                  </Button>
                ))}
              </div>
              <span>
                Showing {visibleRows.length} of {sorted.length} publications
              </span>
            </div>

            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No publications match the selected filters.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="mb-2" />

                <div className="overflow-x-auto rounded-md border border-border/60 bg-card/40">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <button
                            type="button"
                            className="flex items-center gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                            onClick={() => toggleSort("title")}
                          >
                            Title
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                        <TableHead className="hidden md:table-cell">
                          <button
                            type="button"
                            className="flex items-center gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                            onClick={() => toggleSort("firstAuthor")}
                          >
                            First author
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                        <TableHead className="hidden md:table-cell text-right">
                          <button
                            type="button"
                            className="flex w-full items-center justify-end gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                            onClick={() => toggleSort("year")}
                          >
                            Date
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">
                          <button
                            type="button"
                            className="flex items-center gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                            onClick={() => toggleSort("topics")}
                          >
                            Topics
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                        <TableHead className="hidden lg:table-cell">
                          <button
                            type="button"
                            className="flex items-center gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                            onClick={() => toggleSort("institutions")}
                          >
                            Institutions
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                        <TableHead className="hidden md:table-cell">
                          <button
                            type="button"
                            className="flex items-center gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                            onClick={() => toggleSort("venue")}
                          >
                            Venue
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                        <TableHead className="hidden md:table-cell text-right">
                          <button
                            type="button"
                            className="flex w-full items-center justify-end gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                            onClick={() => toggleSort("citations")}
                          >
                            Citations
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((w) => {

                        const doiUrl = (() => {
                          const rawDoi = (w.doi || "").trim();
                          if (!rawDoi) return "";
                          const cleaned = rawDoi
                            .replace(/^https?:\/\/(www\.)?doi\.org\//i, "")
                            .replace(/^doi:/i, "")
                            .trim();
                          return cleaned ? `https://doi.org/${cleaned}` : "";
                        })();

                        const displayDate = formatPublicationDate(w);

                        return (
                          <TableRow key={w.workId}>
                            <TableCell className="align-top text-foreground">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-3 w-3 text-primary" />
                                  {doiUrl ? (
                                    <a
                                      href={doiUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-medium text-primary hover:underline"
                                    >
                                      {renderTitleHtml(w.title)}
                                    </a>
                                  ) : (
                                    <span className="font-medium">
                                      {renderTitleHtml(w.title)}
                                    </span>
                                  )}
                                </div>

                                {/* Compact line for mobile */}
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground md:hidden">
                                  {w.venue && (
                                    <span className="font-semibold text-foreground">
                                      {w.venue}
                                    </span>
                                  )}

                                  {w.allAuthors && w.allAuthors.length > 0 ? (
                                    <>
                                      <span>•</span>
                                      <span>{formatFirstAuthor(w.allAuthors, w.firstAuthorLastName)}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>•</span>
                                      <span>Authors n/a</span>
                                    </>
                                  )}

                                  {displayDate && (
                                    <>
                                      <span>•</span>
                                      <span>{displayDate}</span>
                                    </>
                                  )}

                                  {typeof w.citations === "number" && w.citations > 0 && (
                                    <>
                                      <span>•</span>
                                      <span>{w.citations} citations</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            {/* Desktop-only cells */}
                            <TableCell className="hidden md:table-cell text-muted-foreground">
                              {w.allAuthors && w.allAuthors.length > 0 ? (
                                <span
                                  title={w.allAuthors.join(", ")}
                                  className="cursor-default"
                                >
                                  {formatFirstAuthor(w.allAuthors, w.firstAuthorLastName)}
                                </span>
                              ) : (
                                ""
                              )}
                            </TableCell>

                            <TableCell
                              className="hidden md:table-cell text-right text-muted-foreground"
                              title={getPublicationTooltip(w)}
                            >
                              {displayDate}
                            </TableCell>

                            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                              {(w.topics || []).join(", ")}
                            </TableCell>

                                                        <TableCell
                              className="hidden lg:table-cell text-xs text-muted-foreground"
                              title={(w.institutions || []).join(", ")}
                            >
                              {(() => {
                                const institutions = w.institutions || [];
                                const maxToShow = 2;
                                const shown = institutions.slice(0, maxToShow);
                                const remaining = institutions.length - shown.length;

                                return (
                                  <>
                                    {shown.join(", ")}
                                    {remaining > 0 && (
                                      <span className="text-muted-foreground/80">
                                        {shown.length ? ", " : ""}
                                        +{remaining} more
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </TableCell>


                            <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                              {w.venue}
                            </TableCell>

                            <TableCell className="hidden md:table-cell text-right">
                              {w.citations ?? 0}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {hasMoreToShow && (
                  <div className="flex justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVisibleCount((count) =>
                          Math.min(count + PAGE_SIZE, sorted.length),
                        )
                      }
                    >
                      Load more
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVisibleCount(sorted.length)}
                    >
                      Load all
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>



        </Card>

      </main>
    </SiteShell>
  );
};

export default PublicationsPage;
