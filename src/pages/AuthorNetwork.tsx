import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { User, Download, Linkedin, Link as LinkIcon, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteShell } from "@/components/SiteShell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { authors } from "@/data/authors.generated";
import { worksTable } from "@/data/worksTable.generated";
import { toast } from "@/components/ui/use-toast";

type CoAuthorRow = {
  id: string;
  name: string;
  institutions: string;
  jointPublications: number;
  totalCitations: number;
  hasProfile: boolean;
};

const normalizeName = (raw: string) => {
  if (!raw) return "";
  let s = raw.trim().toLowerCase();
  s = s.normalize("NFD").replace(/\p{M}+/gu, "");
  s = s.replace(/[\u2010-\u2015]/g, "-");
  s = s.replace(/[.,']/g, "");
  s = s.replace(/\s+/g, " ");
  return s;
};

const normalizeOpenAlexId = (raw?: string | null) => {
  if (!raw) return "";
  return raw.replace(/^https?:\/\/(www\.)?openalex\.org\//i, "").trim();
};

  export default function AuthorNetwork() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [sortBy, setSortBy] = useState<"name" | "institutions" | "jointPublications" | "totalCitations">(
    "jointPublications",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [startYear, setStartYear] = useState<number | null>(null);
  const [endYear, setEndYear] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(15);
  const [searchQuery, setSearchQuery] = useState("");
  const isLoading = false;
  const error: string | null = null;

  const localAuthor = useMemo(
    () =>
      authors.find(
        (a) =>
          a.authorId === id ||
          normalizeOpenAlexId(a.openAlexId) === normalizeOpenAlexId(id) ||
          (a.openAlexIds || []).some((alt) => normalizeOpenAlexId(alt) === normalizeOpenAlexId(id)),
      ) || null,
    [id],
  );

  const resolvedOpenAlexId = useMemo(() => {
    if (localAuthor) {
      const primary = normalizeOpenAlexId(localAuthor.openAlexId);
      if (primary) return primary;
      const alt = (localAuthor.openAlexIds || [])
        .map((raw) => normalizeOpenAlexId(raw))
        .find(Boolean);
      if (alt) return alt;
    }
    const direct = normalizeOpenAlexId(id);
    return direct || null;
  }, [id, localAuthor]);

  const focalName = localAuthor?.name || (typeof id === "string" ? id : "");
  const focalNameLower = focalName.trim().toLowerCase();

  const authorWorks = useMemo(() => {
    if (!worksTable.length) return [];
    if (!resolvedOpenAlexId && !focalNameLower) return [];
    return worksTable.filter((work) => {
      const ids = work.allAuthorOpenAlexIds || [];
      const names = work.allAuthors || [];
      const idMatch = resolvedOpenAlexId ? ids.includes(resolvedOpenAlexId) : false;
      const nameMatch =
        !resolvedOpenAlexId && focalNameLower
          ? names.some((name) => name?.trim().toLowerCase() === focalNameLower)
          : false;
      return idMatch || nameMatch;
    });
  }, [focalNameLower, resolvedOpenAlexId]);

  const allYears = useMemo(() => {
    const years = new Set<number>();
    for (const work of authorWorks) {
      if (work.year) {
        years.add(work.year);
      }
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [authorWorks]);

useEffect(() => {
  if (!allYears.length) return;
  const minYear = allYears[0];
  const maxYear = allYears[allYears.length - 1];

  setStartYear((prev) => (prev == null ? minYear : prev));
  setEndYear((prev) => (prev == null ? maxYear : prev));
}, [allYears]);


  const filteredWorks = useMemo(() => {
    if (!authorWorks.length) return [];
    if (!allYears.length) return authorWorks;

    const from = startYear ?? allYears[0];
    const to = endYear ?? allYears[allYears.length - 1];

    return authorWorks.filter((work) => work.year >= from && work.year <= to);
  }, [authorWorks, allYears, startYear, endYear]);

  const coAuthors = useMemo<CoAuthorRow[]>(() => {
    if (!id && !resolvedOpenAlexId && !focalNameLower) return [];

    const byKey = new Map<string, CoAuthorRow>();

    for (const work of filteredWorks) {
      const authorNames = work.allAuthors || [];
      const authorIds = work.allAuthorOpenAlexIds || [];
      const focalPresent =
        (resolvedOpenAlexId && authorIds.includes(resolvedOpenAlexId)) ||
        (!resolvedOpenAlexId &&
          focalNameLower &&
          authorNames.some((name) => name?.trim().toLowerCase() === focalNameLower));
      if (!focalPresent) continue;

      const yearCitations = work.citations ?? 0;
      const workInstitutions = (work.institutions || []).filter(Boolean);

      authorNames.forEach((rawName, index) => {
        const name = rawName?.trim();
        if (!name) return;
        const authorId = authorIds[index] || "";

        if (resolvedOpenAlexId && authorId === resolvedOpenAlexId) return;
        if (focalNameLower && name.toLowerCase() === focalNameLower) return;

        const key = name;
        const local = authors.find(
          (auth) =>
            (authorId && auth.openAlexId === authorId) ||
            normalizeName(auth.name) === normalizeName(name),
        );

        const existing = byKey.get(key) ?? {
          id: local?.openAlexId || authorId,
          name: local?.name || name,
          institutions: "",
          jointPublications: 0,
          totalCitations: 0,
          hasProfile: !!local,
        };

        existing.jointPublications += 1;
        existing.totalCitations += yearCitations;
        if (workInstitutions.length) {
          const merged = new Set(
            `${existing.institutions}${
              existing.institutions && workInstitutions.length ? ", " : ""
            }${workInstitutions.join(", ")}`
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          );
          existing.institutions = Array.from(merged).join(", ");
        }

        byKey.set(key, existing);
      });
    }

    const rows = Array.from(byKey.values());
    rows.sort((a, b) => b.jointPublications - a.jointPublications);
    return rows;
  }, [filteredWorks, focalNameLower, id, resolvedOpenAlexId]);

  const filteredCoAuthors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return coAuthors;
    return coAuthors.filter((row) => {
      const haystack = `${row.name} ${row.institutions}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [coAuthors, searchQuery]);

  const sortedCoAuthors = useMemo(() => {
    const rows = [...filteredCoAuthors];
    const dir = sortOrder === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "institutions":
          return a.institutions.localeCompare(b.institutions) * dir;
        case "jointPublications":
          return (a.jointPublications - b.jointPublications) * dir;
        case "totalCitations":
          return (a.totalCitations - b.totalCitations) * dir;
        default:
          return 0;
      }
    });
    return rows;
  }, [filteredCoAuthors, sortBy, sortOrder]);

  const visibleRows = useMemo(
    () => sortedCoAuthors.slice(0, visibleCount),
    [sortedCoAuthors, visibleCount],
  );

    const totalCoAuthors = coAuthors.length;
    const totalJointPublications = coAuthors.reduce(
      (sum, row) => sum + row.jointPublications,
      0,
    );
    const totalCitations = coAuthors.reduce(
      (sum, row) => sum + row.totalCitations,
      0,
    );

  useEffect(() => {
    setVisibleCount(15);
  }, [sortedCoAuthors]);

  const toggleSort = (
    field: CoAuthorRow["name"] | "institutions" | "jointPublications" | "totalCitations",
  ) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field as typeof sortBy);
      setSortOrder(field === "name" ? "asc" : "desc");
    }
  };

  const title = localAuthor?.name || id || "Co-author network";

  const goToPublications = (row: CoAuthorRow, mode: "publications" | "citations") => {
    const search = new URLSearchParams();
    if (localAuthor?.name || title) {
      search.set("author", localAuthor?.name || title);
    }
    if (resolvedOpenAlexId) {
      search.set("authorId", resolvedOpenAlexId);
    }
    if (row.name) search.set("coauthor", row.name);
    if (startYear != null) search.set("fromYear", String(startYear));
    if (endYear != null) search.set("toYear", String(endYear));
    navigate(`/${mode}?${search.toString()}`);
  };

  const handleExportCsv = () => {
    if (!sortedCoAuthors.length) return;

    const escape = (value: unknown) => {
      const str = value == null ? "" : String(value);
      if (str === "") return "";
      const cleaned = str.replace(/\r?\n/g, " ");
      if (/[",]/.test(cleaned)) {
        return `"${cleaned.replace(/"/g, '""')}"`;
      }
      return cleaned;
    };

    const lines: string[] = [
      "author_id,author_name,institutions,joint_publications,total_citations",
    ];
    sortedCoAuthors.forEach((row) => {
      lines.push(
        [
          escape(row.id),
          escape(row.name),
          escape(row.institutions),
          escape(row.jointPublications),
          escape(row.totalCitations),
        ].join(","),
      );
    });

    const csv = `\uFEFF${lines.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coauthors-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        description: "Co-author table URL copied to clipboard.",
      });
    } catch {
      // Ignore clipboard errors; not critical
    }
  };

    return (
      <SiteShell>
        <main className="container mx-auto px-4 py-6 space-y-4">
          <div className="flex flex-wrap gap-2">
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
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold text-foreground">Co-author summary</span>
              </CardTitle>
              <div className="flex flex-col items-stretch gap-2 text-xs text-muted-foreground sm:items-end">
                <span>
                  Author:{" "}
                  {id ? (
                    <Link
                      to={`/author/${id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {title}
                    </Link>
                  ) : (
                    <span className="font-semibold text-foreground">{title}</span>
                  )}
                </span>
                  {coAuthors.length > 0 && (
                    <span>
                    <span className="font-semibold text-foreground">{totalCoAuthors}</span>{" "}
                    co-authors &middot;{" "}
                    <span className="font-semibold text-foreground">
                      {totalJointPublications}
                    </span>{" "}
                    joint publications &middot;{" "}
                    <span className="font-semibold text-foreground">{totalCitations}</span>{" "}
                    total citations
                  </span>
                  )}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Search co-authors…"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setVisibleCount(15);
                      }}
                      className="h-8 pl-2 pr-2 text-xs w-40"
                    />
                  </div>
                  <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent"
                  onClick={handleExportCsv}
                  title="Export CSV"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent"
                  onClick={handleShareLinkedIn}
                  title="Share on LinkedIn"
                >
                  <Linkedin className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent"
                  onClick={handleCopyLink}
                  title="Copy link"
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <p className="text-xs text-muted-foreground">Loading co-author data…</p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}

            {!isLoading && !error && sortedCoAuthors.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No co-author records were found for this author in the snapshot data.
              </p>
            )}

            {!isLoading && !error && sortedCoAuthors.length > 0 && (
              <>
                {allYears.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
                  </div>
                )}

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {visibleRows.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-md border border-border/60 bg-card/40 p-4 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <User className="mt-0.5 h-4 w-4 text-primary" />
                        <div className="flex-1 space-y-1">
                          <div className="font-semibold text-foreground">
                            {row.hasProfile ? (
                              <button
                                type="button"
                                className="text-left text-primary hover:underline"
                                onClick={() => navigate(`/author/${row.id}`)}
                              >
                                {row.name}
                              </button>
                            ) : (
                              row.name
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.institutions || "Not specified"}
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <button
                              type="button"
                              className="flex items-center gap-1 text-primary hover:underline"
                              onClick={() => {
                                goToPublications(row, "publications");
                              }}
                            >
                              <span className="font-semibold">{row.jointPublications}</span>
                              <span className="text-muted-foreground">joint pubs</span>
                            </button>
                            <button
                              type="button"
                              className="flex items-center gap-1 text-primary hover:underline"
                              onClick={() => {
                                goToPublications(row, "citations");
                              }}
                            >
                              <span className="font-semibold text-foreground">
                                {row.totalCitations}
                              </span>
                              <span className="text-muted-foreground">citations</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden overflow-x-auto rounded-md border border-border/60 bg-card/40 md:block">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <button
                            type="button"
                            className="flex items-center gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                            onClick={() => toggleSort("name")}
                          >
                            Co-author
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            className="flex items-center gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                            onClick={() => toggleSort("institutions")}
                          >
                            Institutions
                          </button>
                        </TableHead>
                        <TableHead className="text-right">
                          <button
                            type="button"
                            className="flex w-full items-center justify-end gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                            onClick={() => toggleSort("jointPublications")}
                          >
                            Joint publications
                          </button>
                        </TableHead>
                        <TableHead className="text-right">
                          <button
                            type="button"
                            className="flex w-full items-center justify-end gap-1 bg-transparent p-0 text-xs font-medium text-muted-foreground hover:text-foreground border-0 focus-visible:outline-none"
                            onClick={() => toggleSort("totalCitations")}
                          >
                            Total citations
                          </button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.map((row) => (
                        <TableRow
                          key={row.id}
                          className={row.hasProfile ? "cursor-pointer hover:bg-muted/40" : ""}
                          onClick={() => {
                            if (row.hasProfile) navigate(`/author/${row.id}`);
                          }}
                        >
                          <TableCell className="font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-primary" />
                              {row.hasProfile ? (
                                <button
                                  type="button"
                                  className="text-primary hover:underline text-left"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/author/${row.id}`);
                                  }}
                                >
                                  {row.name}
                                </button>
                              ) : (
                                <span>{row.name}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {row.institutions || "Not specified"}
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                goToPublications(row, "publications");
                              }}
                            >
                              {row.jointPublications}
                            </button>
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                goToPublications(row, "citations");
                              }}
                            >
                              {row.totalCitations}
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {sortedCoAuthors.length > visibleCount && (
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVisibleCount((prev) =>
                          Math.min(prev + 15, sortedCoAuthors.length),
                        )
                      }
                    >
                      Load more
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVisibleCount(sortedCoAuthors.length)}
                    >
                      Load all
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </SiteShell>
  );
}
