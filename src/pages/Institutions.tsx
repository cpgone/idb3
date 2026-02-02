import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUpDown, Download, FileText, Link as LinkIcon, Building2, Search } from "lucide-react";
import { SiteShell } from "@/components/SiteShell";
import { institutionStats } from "@/data/topicInstitutionStats.generated";
import { worksTable } from "@/data/worksTable.generated";
import { filterWorks } from "@/lib/blacklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import insightsConfig from "../../data/config/insightsconfig.json";

type InstitutionSortField = "name" | "publications" | "citations";

const PAGE_SIZE = 15;

const defaultYearRangeConfig =
  (insightsConfig as {
    defaultYearRangePages?: { from?: number | null; to?: number | null };
    defaultYearRange?: { from?: number | null; to?: number | null };
  })?.defaultYearRangePages ||
  (insightsConfig as { defaultYearRange?: { from?: number | null; to?: number | null } })
    ?.defaultYearRange ||
  {};

// Normalize names so dash/diacritic differences don't prevent matches
const normalizeName = (raw: string) => {
  if (!raw) return "";
  let s = raw.trim().toLowerCase();
  s = s.normalize("NFD").replace(/\p{M}+/gu, "");
  s = s.replace(/[\u2010-\u2015]/g, "-");
  s = s.replace(/[.,']/g, "");
  s = s.replace(/\s+/g, " ");
  return s;
};

const InstitutionsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authorFilter = searchParams.get("author") || "";
  const authorIdFilter = searchParams.get("authorId") || "";
  const fromYearParam = searchParams.get("fromYear");
  const toYearParam = searchParams.get("toYear");

  const [sortBy, setSortBy] = useState<InstitutionSortField>("publications");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");

  const cleanWorks = useMemo(() => filterWorks(worksTable), []);

  const allYears = useMemo(() => {
    const years = new Set<number>();
    for (const w of cleanWorks) {
      if (w.year && w.year > 0) years.add(w.year);
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [cleanWorks]);

  const [startYear, setStartYear] = useState<number | null>(null);
  const [endYear, setEndYear] = useState<number | null>(null);

useEffect(() => {
  if (!allYears.length) return;
  const fallbackFrom = defaultYearRangeConfig.from ?? allYears[0];
  const fallbackTo = defaultYearRangeConfig.to ?? allYears[allYears.length - 1];

  setStartYear((prev) => {
    if (prev != null) return prev;
    if (fromYearParam) return Number(fromYearParam);
    return fallbackFrom;
  });
  setEndYear((prev) => {
    if (prev != null) return prev;
    if (toYearParam) return Number(toYearParam);
    return fallbackTo;
  });
}, [allYears, fromYearParam, toYearParam, defaultYearRangeConfig.from, defaultYearRangeConfig.to]);


  const scopedStats = useMemo(() => {
    const from = startYear ?? (allYears.length ? allYears[0] : undefined);
    const to = endYear ?? (allYears.length ? allYears[allYears.length - 1] : undefined);

    if (!authorFilter && from == null && to == null) return institutionStats;

    const byName = new Map<
      string,
      { id: string; name: string; publications: number; citations: number }
    >();

    const idByName = new Map<string, string>();
    for (const inst of institutionStats) {
      idByName.set(inst.name, inst.id);
    }

    const normalizedAuthor = normalizeName(authorFilter);

    for (const work of cleanWorks) {
      if (authorIdFilter) {
        if (!(work.allAuthorOpenAlexIds || []).includes(authorIdFilter)) continue;
      } else if (
        normalizedAuthor &&
        !(work.allAuthors || []).some(
          (name) => normalizeName(name) === normalizedAuthor,
        )
      ) {
        continue;
      }
      if (!work.year) continue;
      if (from != null && work.year < from) continue;
      if (to != null && work.year > to) continue;
      const institutions = work.institutions || [];
      for (const instName of institutions) {
        if (!instName) continue;
        const existing =
          byName.get(instName) ?? {
            id: idByName.get(instName) || instName,
            name: instName,
            publications: 0,
            citations: 0,
          };
        existing.publications += 1;
        existing.citations += work.citations ?? 0;
        byName.set(instName, existing);
      }
    }

    return Array.from(byName.values());
  }, [authorFilter, authorIdFilter, startYear, endYear, allYears, cleanWorks]);

  const buildYearRange = () => {
    const from = startYear ?? (allYears.length ? allYears[0] : undefined);
    const to = endYear ?? (allYears.length ? allYears[allYears.length - 1] : undefined);
    return { from, to };
  };

  const buildInstitutionPublicationsPath = (institutionName: string) => {
    const search = new URLSearchParams();
    const { from, to } = buildYearRange();
    if (from != null) search.set("fromYear", String(from));
    if (to != null) search.set("toYear", String(to));
    if (authorFilter) search.set("author", authorFilter);
    if (authorIdFilter) search.set("authorId", authorIdFilter);
    search.set("institution", institutionName);
    return `/publications?${search.toString()}`;
  };

  const buildInstitutionCitationsPath = (institutionName: string) => {
    const search = new URLSearchParams();
    const { from, to } = buildYearRange();
    if (from != null) search.set("fromYear", String(from));
    if (to != null) search.set("toYear", String(to));
    if (authorFilter) search.set("author", authorFilter);
    if (authorIdFilter) search.set("authorId", authorIdFilter);
    search.set("institution", institutionName);
    return `/citations?${search.toString()}`;
  };

  const sorted = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const items = scopedStats.filter((row) => {
      if (!query) return true;
      const haystack = `${row.name} ${row.id}`.toLowerCase();
      return haystack.includes(query);
    });

    const dir = sortOrder === "asc" ? 1 : -1;
    items.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "publications":
          return (a.publications - b.publications) * dir;
        case "citations":
        default:
          return (a.citations - b.citations) * dir;
      }
    });
    return items;
  }, [scopedStats, sortBy, sortOrder, searchQuery]);

  const visibleRows = sorted.slice(0, visibleCount);
  const hasMoreToShow = visibleCount < sorted.length;

  const toggleSort = (field: InstitutionSortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
  };

  const handleSavePdf = () => {
    window.print();
  };

  const handleCopyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copied",
        description: "Institutions page URL copied to clipboard.",
      });
    } catch {
      // ignore
    }
  };

  const handleExportCsv = () => {
    if (!sorted.length) return;

    const headers = ["institution_name", "publications", "citations"];

    const escape = (value: unknown) => {
      const str = value == null ? "" : String(value);
      if (str === "") return "";
      const cleaned = str.replace(/\r?\n/g, " ");
      if (/[",]/.test(cleaned)) {
        return `"${cleaned.replace(/"/g, '""')}"`;
      }
      return cleaned;
    };

    const lines = [headers.join(",")];

    for (const row of sorted) {
      lines.push(
        [
          escape(row.name),
          escape(row.publications),
          escape(row.citations),
        ].join(","),
      );
    }

    const csv = `\uFEFF${lines.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "institutions.csv";
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
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle>Institutions</CardTitle>
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
                  placeholder="Search institutions..."
                  className="h-8 pl-7 pr-2 text-xs"
                />
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border border-border/60 bg-card/40">
              <div className="flex flex-wrap items-center justify-end gap-3 px-3 pt-3 text-[11px] text-muted-foreground">
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

              <div className="px-3 pb-2 text-xs text-muted-foreground">
                Showing {visibleRows.length.toLocaleString()} of {sorted.length.toLocaleString()} institutions
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                        onClick={() => toggleSort("name")}
                      >
                        Institution
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="hidden md:table-cell text-right">
                      <button
                        type="button"
                        className="flex w-full items-center justify-end gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                        onClick={() => toggleSort("publications")}
                      >
                        Publications
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
                  {visibleRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="align-top text-foreground">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3 w-3 text-primary" />
                            <span>{row.name}</span>
                          </div>

                          {/* Mobile compact line */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground md:hidden">
                            <span>{row.publications} publications</span>
                            <span>•</span>
                            <span>{row.citations} citations</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right">
                        {row.publications > 0 ? (
                          <Link
                            to={buildInstitutionPublicationsPath(row.name)}
                            className="text-primary hover:underline"
                          >
                            {row.publications}
                          </Link>
                        ) : (
                          row.publications
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right">
                        {row.citations > 0 ? (
                          <Link
                            to={buildInstitutionCitationsPath(row.name)}
                            className="text-primary hover:underline"
                          >
                            {row.citations}
                          </Link>
                        ) : (
                          row.citations
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {hasMoreToShow && (
              <div className="flex justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setVisibleCount((count) => Math.min(count + PAGE_SIZE, sorted.length))
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
          </CardContent>
        </Card>
      </main>
    </SiteShell>
  );
};

export default InstitutionsPage;
