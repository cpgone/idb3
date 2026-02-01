import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpDown, Download, FileText, Link as LinkIcon, Search, Users, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { SiteShell } from "@/components/SiteShell";
import { authors } from "@/data/authors.generated";
import { worksTable } from "@/data/worksTable.generated";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { makeWorkKey, normalizeOpenAlexId } from "@/lib/utils";

type MemberSortField = "name" | "publications" | "citations" | "hIndex";

interface MemberRow {
  id: string;
  name: string;
  email: string;
  publications: number;
  citations: number;
  hIndex: number;
  openAlexId: string;
}

const PAGE_SIZE = 15;

const Members = () => {
  const navigate = useNavigate();

  const [sortBy, setSortBy] = useState<MemberSortField>("hIndex");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");

  const allYears = useMemo(() => {
    const years = new Set<number>();
    for (const w of worksTable) {
      if (w.year && w.year >= 1900 && w.year <= new Date().getFullYear() + 1) {
        years.add(w.year);
      }
    }
    return Array.from(years).sort((a, b) => a - b);
  }, []);

  const [startYear, setStartYear] = useState<number | null>(null);
  const [endYear, setEndYear] = useState<number | null>(null);

  // Initialize year range once we know available years
  // Initialize year range once we know available years (full range)
  useEffect(() => {
    if (!allYears.length) return;
    const minYear = allYears[0];
    const maxYear = allYears[allYears.length - 1];
    setStartYear((prev) => (prev == null ? minYear : prev));
    setEndYear((prev) => (prev == null ? maxYear : prev));
  }, [allYears]);


  const metricsByAuthor = useMemo(() => {
    if (!allYears.length) {
      return new Map<string, { publications: number; citations: number; hIndex: number }>();
    }

    const from = startYear ?? allYears[0];
    const to = endYear ?? allYears[allYears.length - 1];

    type Bucket = { citationsList: number[]; seenWorkKeys: Set<string>; institutions: Set<string> };
    const temp = new Map<string, Bucket>();

    worksTable.forEach((work) => {
      if (!work.year) return;
      if (work.year < from || work.year > to) return;

      const baseKey = makeWorkKey(work);
      const workKey =
        baseKey ||
        `${work.workId || ""}|${work.doi || ""}|${work.program || ""}|${work.title || ""}|${work.year ?? ""}`;

      const citations = work.citations ?? 0;

      const idKeys = Array.from(
        new Set(
          (work.allAuthorOpenAlexIds || [])
            .map((raw) => normalizeOpenAlexId(raw))
            .filter((id): id is string => !!id)
            .map((id) => `id:${id}`),
        ),
      );

      const nameKeys = Array.from(
        new Set(
          (work.allAuthors || [])
            .map((name) => name?.trim().toLowerCase())
            .filter((name): name is string => !!name)
            .map((name) => `name:${name}`),
        ),
      );

      const participantKeys = [...idKeys, ...nameKeys];
      const perWorkSeen = new Set<string>();

      participantKeys.forEach((key) => {
        if (perWorkSeen.has(key)) return;
        perWorkSeen.add(key);

        const bucket =
          temp.get(key) ??
          { citationsList: [], seenWorkKeys: new Set<string>(), institutions: new Set<string>() };
        if (bucket.seenWorkKeys.has(workKey)) {
          temp.set(key, bucket);
          return;
        }
        bucket.seenWorkKeys.add(workKey);
        bucket.citationsList.push(citations);
        (work.institutions || []).forEach((inst) => {
          if (inst) bucket.institutions.add(inst);
        });
        temp.set(key, bucket);
      });
    });

    const result = new Map<
      string,
      { publications: number; citations: number; hIndex: number; institutions: string[] }
    >();

    for (const [key, value] of temp) {
      const pubs = value.seenWorkKeys.size;
      const citations = value.citationsList.reduce((sum, c) => sum + c, 0);
      const sorted = [...value.citationsList].sort((a, b) => b - a);
      let h = 0;
      for (let i = 0; i < sorted.length; i += 1) {
        if (sorted[i] >= i + 1) h = i + 1;
        else break;
      }
      result.set(key, {
        publications: pubs,
        citations,
        hIndex: h,
        institutions: Array.from(value.institutions),
      });
    }

    return result;
  }, [allYears, startYear, endYear]);

  const rows = useMemo<MemberRow[]>(() => {
    return authors.map((author) => {
      const normalizedId = normalizeOpenAlexId(author.openAlexId);
      const fallbackName = author.name.trim().toLowerCase();
      const key = normalizedId ? `id:${normalizedId}` : fallbackName ? `name:${fallbackName}` : null;
      const metrics = key ? metricsByAuthor.get(key) || null : null;

      return {
        id: author.authorId,
        name: author.name,
        email: author.email,
        publications: metrics ? metrics.publications : 0,
        citations: metrics ? metrics.citations : 0,
        hIndex: metrics ? metrics.hIndex : author.hIndex,
        openAlexId: author.openAlexId,
      };
    });
  }, [metricsByAuthor]);

  const filteredRows = useMemo(() => {
    let next = rows;

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      next = next.filter((row) => {
        const haystack = [row.name, row.email].join(" ").toLowerCase();
        return haystack.includes(query);
      });
    }

    return next;
  }, [rows, searchQuery]);

  const sortedRows = useMemo(() => {
    const items = [...filteredRows];
    items.sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "publications":
          return (a.publications - b.publications) * dir;
        case "citations":
          return (a.citations - b.citations) * dir;
        case "hIndex":
        default:
          return (a.hIndex - b.hIndex) * dir;
      }
    });
    return items;
  }, [filteredRows, sortBy, sortOrder]);

  const visibleRows = sortedRows.slice(0, visibleCount);
  const hasMoreToShow = visibleCount < sortedRows.length;

  const buildYearRange = () => {
    const from = startYear ?? (allYears.length ? allYears[0] : undefined);
    const to = endYear ?? (allYears.length ? allYears[allYears.length - 1] : undefined);
    return { from, to };
  };

  const buildMemberPublicationsPath = (authorName: string) => {
    const search = new URLSearchParams();
    const { from, to } = buildYearRange();
    if (from != null) search.set("fromYear", String(from));
    if (to != null) search.set("toYear", String(to));
    search.set("author", authorName);
    return `/publications?${search.toString()}`;
  };

  const buildMemberCitationsPath = (authorName: string) => {
    const search = new URLSearchParams();
    const { from, to } = buildYearRange();
    if (from != null) search.set("fromYear", String(from));
    if (to != null) search.set("toYear", String(to));
    search.set("author", authorName);
    return `/citations?${search.toString()}`;
  };

  const toggleSort = (field: MemberSortField) => {
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
        description: "Members page URL copied to clipboard.",
      });
    } catch {
      // ignore
    }
  };

  const handleExportCsv = () => {
    if (!sortedRows.length) return;

    const headers = [
      "author_name",
      "email",
      "publications",
      "citations",
      "h_index",
    ];

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

    for (const row of sortedRows) {
      lines.push(
        [
          escape(row.name),
          escape(row.email),
          escape(row.publications),
          escape(row.citations),
          escape(row.hIndex),
        ].join(","),
      );
    }

    const csv = `\uFEFF${lines.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "members.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SiteShell>
      <main className="container mx-auto px-4 py-6 space-y-4">
        <Button variant="ghost" onClick={() => navigate("/")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to dashboard
        </Button>

        <Card className="border-border/60">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:flex-1">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <CardTitle>Members</CardTitle>
              </div>
              <div className="flex w-full justify-center text-xs text-muted-foreground">
                <div className="relative w-full max-w-md">
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setVisibleCount(PAGE_SIZE);
                    }}
                    placeholder="Search members, affiliations…"
                    className="h-8 pl-7 pr-2 text-xs"
                  />
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2">
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
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border border-border/60 bg-card/40">
              <Table className="w-full text-xs sm:text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        type="button"
                        className="flex items-center gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                        onClick={() => toggleSort("name")}
                      >
                        Author
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">Email</TableHead>
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
                    <TableHead className="hidden md:table-cell text-right">
                      <button
                        type="button"
                        className="flex w-full items-center justify-end gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                        onClick={() => toggleSort("hIndex")}
                      >
                        h-index
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="align-top font-medium text-foreground">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-primary" />
                            {row.openAlexId ? (
                              <button
                                type="button"
                                className="text-primary hover:underline"
                                onClick={() => navigate(`/author/${row.openAlexId}`)}
                              >
                                {row.name}
                              </button>
                            ) : (
                              row.name
                            )}
                          </div>

                          {/* Mobile compact line */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground md:hidden">
                            <span>•</span>
                            <Link
                              to={buildMemberPublicationsPath(row.name)}
                              className="text-primary hover:underline"
                            >
                              {row.publications} publications
                            </Link>
                            <span>•</span>
                            <Link
                              to={buildMemberCitationsPath(row.name)}
                              className="text-primary hover:underline"
                            >
                              {row.citations} citations
                            </Link>
                            <span>•</span>
                            <span>h-index {row.hIndex}</span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        {row.email}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right cell-compact font-medium text-foreground">
                        {row.publications > 0 ? (
                          <Link
                            to={buildMemberPublicationsPath(row.name)}
                            className="text-primary hover:underline"
                          >
                            {row.publications}
                          </Link>
                        ) : (
                          row.publications
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right cell-compact font-medium text-foreground">
                        {row.citations > 0 ? (
                          <Link
                            to={buildMemberCitationsPath(row.name)}
                            className="text-primary hover:underline"
                          >
                            {row.citations}
                          </Link>
                        ) : (
                          row.citations
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right cell-compact font-medium text-foreground">
                        {row.hIndex}
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
                    setVisibleCount((count) =>
                      Math.min(count + PAGE_SIZE, sortedRows.length),
                    )
                  }
                >
                  Load more
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleCount(sortedRows.length)}
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

export default Members;
