import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ExternalLink, Loader2, Link2, BookOpen, Copy, LifeBuoy } from "lucide-react";
import {
  searchAuthors,
  getAuthorWorks,
  searchWorksByTitle,
  searchWorksGlobalByTitle,
  searchWorksByDoi,
  type OpenAlexAuthor,
  type OpenAlexWork,
} from "@/services/openAlex";
import { useToast } from "@/hooks/use-toast";
import { SiteShell } from "@/components/SiteShell";

export default function Help() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<OpenAlexAuthor[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [workPreviews, setWorkPreviews] = useState<Record<string, OpenAlexWork[]>>({});
  const [loadingWorks, setLoadingWorks] = useState<Record<string, boolean>>({});
  const [workSearchQueries, setWorkSearchQueries] = useState<Record<string, string>>({});
  const [workSearchResults, setWorkSearchResults] = useState<Record<string, OpenAlexWork[]>>({});
  const [isSearchingWorks, setIsSearchingWorks] = useState<Record<string, boolean>>({});
  const [visiblePreviewCount, setVisiblePreviewCount] = useState<Record<string, number>>({});
  const [globalWorkQuery, setGlobalWorkQuery] = useState("");
  const [globalWorkResults, setGlobalWorkResults] = useState<OpenAlexWork[]>([]);
  const [isSearchingGlobalWorks, setIsSearchingGlobalWorks] = useState(false);
  const { toast } = useToast();

  const normalizeOpenAlexId = (raw?: string | null) => {
    if (!raw) return "";
    const parts = raw.split("/");
    return parts[parts.length - 1] || raw;
  };

  const normalizeWorkId = (raw?: string | null) => {
    if (!raw) return "";
    const parts = raw.split("/");
    return parts[parts.length - 1] || raw;
  };

  const buildDoiHref = (doi?: string | null) => {
    if (!doi) return "";
    const cleaned = doi.replace(/^https?:\/\/(www\.)?doi\.org\//i, "").replace(/^doi:/i, "").trim();
    return cleaned ? `https://doi.org/${cleaned}` : "";
  };

  const buildOpenAlexHref = (id?: string | null) => {
    const workId = normalizeWorkId(id);
    return workId ? `https://openalex.org/${workId}` : "";
  };

  const normalizeDoiInput = (value: string) => {
    return value
      .trim()
      .replace(/^https?:\/\/(www\.)?doi\.org\//i, "")
      .replace(/^doi:/i, "")
      .replace(/\s+/g, "");
  };

  const formatAuthors = (authorships?: OpenAlexWork["authorships"]) => {
    if (!authorships?.length) return "Authors n/a";
    const names = authorships
      .map((a) => a?.author?.display_name?.trim())
      .filter(Boolean) as string[];
    if (!names.length) return "Authors n/a";
    const limit = 3;
    const visible = names.slice(0, limit).join(", ");
    return names.length > limit ? `${visible}, et al.` : visible;
  };

  const handleCopyId = async (id?: string | null) => {
    if (!id) {
      toast({ title: "No ID available", variant: "destructive" });
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
        toast({ title: "Copied OpenAlex ID", description: id });
        return;
      }
    } catch (err) {
      // fall through to manual fallback
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = id;
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast({ title: "Copied OpenAlex ID", description: id });
    } catch (err) {
      toast({ title: "Could not copy ID", description: id, variant: "destructive" });
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await searchAuthors(searchQuery);
      setSearchResults(results);
      toast({
        title: "Search complete",
        description: `Found ${results.length} authors`,
      });
    } catch (error) {
      toast({
        title: "Search failed",
        description: "Failed to search authors. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleReset = () => {
    setSearchQuery("");
    setSearchResults([]);
    setWorkPreviews({});
    setLoadingWorks({});
    setWorkSearchQueries({});
    setWorkSearchResults({});
    setIsSearchingWorks({});
    setVisiblePreviewCount({});
    setGlobalWorkQuery("");
    setGlobalWorkResults([]);
    setIsSearching(false);
  };

  const handleSearchWorksByTitle = async (author: OpenAlexAuthor) => {
    const query = (workSearchQueries[author.id] || "").trim();
    if (!query) return;

    setIsSearchingWorks((prev) => ({ ...prev, [author.id]: true }));
    try {
      const results = await searchWorksByTitle(author.id, query);
      setWorkSearchResults((prev) => ({ ...prev, [author.id]: results }));
      toast({
        title: "Title search complete",
        description: `Found ${results.length} works matching "${query}"`,
      });
    } catch (error) {
      toast({
        title: "Search failed",
        description: "Could not search works by title.",
        variant: "destructive",
      });
    } finally {
      setIsSearchingWorks((prev) => ({ ...prev, [author.id]: false }));
    }
  };

  const handleSearchGlobalWorks = async () => {
    const query = globalWorkQuery.trim();
    if (!query) return;
    const cleanedDoi = normalizeDoiInput(query);
    const isDoi = cleanedDoi.includes("/");
    setIsSearchingGlobalWorks(true);
    try {
      if (isDoi) {
        const results = await searchWorksByDoi(cleanedDoi);
        setGlobalWorkResults(results);
        toast({
          title: "DOI search complete",
          description: `Found ${results.length} work(s) for DOI ${cleanedDoi}`,
        });
      } else {
        const results = await searchWorksGlobalByTitle(query);
        setGlobalWorkResults(results);
        toast({
          title: "Title search complete",
          description: `Found ${results.length} works matching "${query}"`,
        });
      }
    } catch (error) {
      toast({
        title: "Search failed",
        description: "Could not search works by title or DOI.",
        variant: "destructive",
      });
    } finally {
      setIsSearchingGlobalWorks(false);
    }
  };

  const handleResetWorkFinder = () => {
    setGlobalWorkQuery("");
    setGlobalWorkResults([]);
    setIsSearchingGlobalWorks(false);
  };

  const handleLoadWorks = async (author: OpenAlexAuthor) => {
    setLoadingWorks((prev) => ({ ...prev, [author.id]: true }));
    try {
      const works = await getAuthorWorks(author.id);
      const sorted = [...works].sort((a, b) => (b.publication_year || 0) - (a.publication_year || 0));
      setWorkPreviews((prev) => ({ ...prev, [author.id]: sorted }));
      setVisiblePreviewCount((prev) => ({ ...prev, [author.id]: Math.min(5, sorted.length) }));
      toast({
        title: "Loaded sample works",
        description: `Showing recent titles for ${author.display_name}`,
      });
    } catch (error) {
      toast({
        title: "Could not load works",
        description: "Failed to fetch author works. Try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingWorks((prev) => ({ ...prev, [author.id]: false }));
    }
  };

  const hasResults = useMemo(() => searchResults.length > 0, [searchResults]);

  return (
    <SiteShell>
      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Help &amp; OpenAlex support</h1>
          <p className="text-muted-foreground text-sm">
            Fix OpenAlex profiles, contact support, and search OpenAlex to pinpoint the correct author and work IDs.
          </p>
        </div>

        <Card className="border border-border/60">
          <CardHeader className="pb-2 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" />
              OpenAlex support
            </CardTitle>
            <CardDescription>Useful links for fixing profiles or getting help.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
              <li>
                <a
                  className="text-primary underline"
                  href="https://help.openalex.org/hc/en-us/categories/24734214039703-How-to"
                  target="_blank"
                  rel="noreferrer"
                >
                  How to guide
                </a>
              </li>
              <li>
                <a
                  className="text-primary underline"
                  href="https://docs.google.com/forms/d/e/1FAIpQLSehRQBTvckqFhmbTLruRxu-GEOuaIpZWGBI4PDGcI4E4kZqWQ/viewform"
                  target="_blank"
                  rel="noreferrer"
                >
                  Fix an OpenAlex source profile
                </a>
              </li>
              <li>
                <a
                  className="text-primary underline"
                  href="https://docs.google.com/forms/d/1WzSGs0AIPyghKuSHHzlh3uLJ2QOzz3UJ4feO8xZh_9o/viewform?edit_requested=true"
                  target="_blank"
                  rel="noreferrer"
                >
                  Fix an OpenAlex author profile
                </a>
              </li>
              <li>
                <a
                  className="text-primary underline"
                  href="https://help.openalex.org/hc/en-us/requests/new"
                  target="_blank"
                  rel="noreferrer"
                >
                  Contact OpenAlex support
                </a>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Author ID finder
            </CardTitle>
            <CardDescription>Search for authors by name, ORCID, or affiliation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder="Enter author name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <div className="flex gap-2">
                <Button onClick={handleSearch} disabled={isSearching} className="flex items-center gap-2">
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {isSearching ? "Searching..." : "Search"}
                </Button>
                <Button variant="outline" onClick={handleReset} className="flex items-center gap-1">
                  Reset
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {searchResults.map((author) => {
                const works = workPreviews[author.id];
                const previewCount = visiblePreviewCount[author.id] ?? 5;
                const previewList = works ? works.slice(0, previewCount) : [];
                const isLoading = loadingWorks[author.id];
                const openAlexId = normalizeOpenAlexId(author.id);
                const openAlexUrl = openAlexId
                  ? `https://openalex.org/${openAlexId}`
                  : author.id?.replace("https://api.openalex.org", "https://openalex.org");
                return (
                  <Card key={author.id} className="border border-border/60">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="text-lg font-semibold text-foreground">{author.display_name}</div>
                          {author.last_known_institution?.display_name && (
                            <div className="text-xs text-muted-foreground">
                              {author.last_known_institution.display_name}
                              {author.last_known_institution.country_code ? ` (${author.last_known_institution.country_code})` : ""}
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs text-primary flex-wrap">
                            <a
                              href={openAlexUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline inline-flex items-center gap-1"
                            >
                              View on OpenAlex <ExternalLink className="h-3 w-3" />
                            </a>
                            <span className="text-muted-foreground">ID</span>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-semibold text-primary hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/50"
                            onClick={() => handleCopyId(openAlexId || author.id)}
                            title="Click to copy the OpenAlex ID"
                          >
                            <Copy className="h-3 w-3" />
                            <span className="font-mono">{openAlexId || "ID n/a"}</span>
                          </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary">{author.works_count} publications</Badge>
                          <Badge variant="secondary">{author.cited_by_count} citations</Badge>
                          <Badge variant="secondary">h-index: {author.h_index}</Badge>
                          <Badge variant="secondary">i10: {author.i10_index}</Badge>
                        </div>
                      </div>

                      <div className="rounded-md border border-dashed border-border/60 bg-muted/40 p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <BookOpen className="h-4 w-4 text-primary" />
                            Recent titles (showing 5 at a time)
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleLoadWorks(author)}
                            disabled={isLoading}
                            className="flex items-center gap-1"
                          >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {works ? "Reload" : "Load"}
                          </Button>
                        </div>
                        {works ? (
                          <>
                            <ul className="space-y-2 text-sm">
                              {previewList.map((work) => {
                                const workId = normalizeWorkId(work.id);
                                const doiHref = buildDoiHref(work.doi);
                                const openAlexHref = buildOpenAlexHref(work.id);
                                return (
                                  <li key={work.id} className="flex flex-col">
                                    {workId ? (
                                      <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                        <span className="font-semibold">Work ID:</span>
                                        {openAlexHref ? (
                                          <a
                                            href={openAlexHref}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded bg-muted px-1 py-0.5 text-[11px] hover:underline"
                                          >
                                            {workId}
                                          </a>
                                        ) : (
                                          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{workId}</code>
                                        )}
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          onClick={() => handleCopyId(workId)}
                                          title="Copy work ID"
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ) : null}
                                    <span className="font-medium text-foreground">
                                      {work.publication_year ? `${work.publication_year} - ` : ""}
                                      {doiHref ? (
                                        <a
                                          href={doiHref}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-primary hover:underline"
                                        >
                                          {work.title || "Untitled work"}
                                        </a>
                                      ) : openAlexHref ? (
                                        <a
                                          href={openAlexHref}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-primary hover:underline"
                                        >
                                          {work.title || "Untitled work"}
                                        </a>
                                      ) : (
                                        <span>{work.title || "Untitled work"}</span>
                                      )}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {(work.primary_location?.source?.display_name &&
                                        `${work.primary_location.source.display_name}`) ||
                                        "Venue n/a"}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                            {works.length > previewCount ? (
                              <div className="flex justify-center pt-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setVisiblePreviewCount((prev) => ({
                                      ...prev,
                                      [author.id]: Math.min(previewCount + 5, works.length),
                                    }))
                                  }
                                >
                                  Load more
                                </Button>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Load a few recent works to verify this is the right author.
                          </p>
                        )}
                      </div>

                      <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3 space-y-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-sm font-semibold text-foreground">Search works by title</div>
                          <div className="flex flex-1 items-center gap-2">
                            <Input
                              placeholder="Enter part of the title..."
                              value={workSearchQueries[author.id] || ""}
                              onChange={(e) =>
                                setWorkSearchQueries((prev) => ({ ...prev, [author.id]: e.target.value }))
                              }
                              onKeyDown={(e) => e.key === "Enter" && handleSearchWorksByTitle(author)}
                              className="h-8 text-sm"
                            />
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleSearchWorksByTitle(author)}
                              disabled={!!isSearchingWorks[author.id]}
                            >
                              {isSearchingWorks[author.id] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Search"
                              )}
                            </Button>
                          </div>
                        </div>

                        {workSearchResults[author.id] ? (
                          workSearchResults[author.id].length ? (
                            <ul className="space-y-2 text-sm">
                              {workSearchResults[author.id].map((work) => {
                                const workId = normalizeWorkId(work.id);
                                const doiHref = buildDoiHref(work.doi);
                                const openAlexHref = buildOpenAlexHref(work.id);
                                return (
                                  <li key={work.id} className="rounded-md border border-border/60 bg-card/40 p-2">
                                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold">Work ID:</span>
                                        {openAlexHref ? (
                                          <a
                                            href={openAlexHref}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="rounded bg-muted px-1 py-0.5 text-[11px] hover:underline"
                                          >
                                            {workId || "n/a"}
                                          </a>
                                        ) : (
                                          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{workId || "n/a"}</code>
                                        )}
                                      </div>
                                      {workId ? (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          onClick={() => handleCopyId(workId)}
                                          title="Copy work ID"
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      ) : null}
                                    </div>
                                    <div className="font-medium text-foreground">
                                      {work.publication_year ? `${work.publication_year} - ` : ""}
                                      {doiHref ? (
                                        <a
                                          href={doiHref}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-primary hover:underline"
                                        >
                                          {work.title || "Untitled work"}
                                        </a>
                                      ) : openAlexHref ? (
                                        <a
                                          href={openAlexHref}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-primary hover:underline"
                                        >
                                          {work.title || "Untitled work"}
                                        </a>
                                      ) : (
                                        <span>{work.title || "Untitled work"}</span>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {(work.primary_location?.source?.display_name &&
                                        `${work.primary_location.source.display_name}`) ||
                                        "Venue n/a"}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">No matches for that title.</p>
                          )
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Search by a distinctive title fragment to find and copy the Work ID for blacklisting.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Work ID finder
            </CardTitle>
            <CardDescription>Search any work by title and copy its Work ID for blacklisting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder="Enter title fragment or DOI..."
                value={globalWorkQuery}
                onChange={(e) => setGlobalWorkQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchGlobalWorks()}
                className="flex-1"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleSearchGlobalWorks}
                  disabled={isSearchingGlobalWorks}
                  className="flex items-center gap-2"
                >
                  {isSearchingGlobalWorks ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {isSearchingGlobalWorks ? "Searching..." : "Search"}
                </Button>
                <Button variant="outline" onClick={handleResetWorkFinder} className="flex items-center gap-1">
                  Reset
                </Button>
              </div>
            </div>

            {globalWorkResults.length ? (
              <ul className="space-y-2 text-sm">
                {globalWorkResults.map((work) => {
                  const workId = normalizeWorkId(work.id);
                  const doiHref = buildDoiHref(work.doi);
                  const openAlexHref = buildOpenAlexHref(work.id);
                  return (
                    <li key={work.id} className="rounded-md border border-border/60 bg-card/40 p-3">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">Work ID:</span>
                          {buildOpenAlexHref(work.id) ? (
                            <a
                              href={buildOpenAlexHref(work.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded bg-muted px-1 py-0.5 text-[11px] hover:underline"
                            >
                              {workId || "n/a"}
                            </a>
                          ) : (
                            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{workId || "n/a"}</code>
                          )}
                        </div>
                        {workId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleCopyId(workId)}
                            title="Copy work ID"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        ) : null}
                      </div>
                      <div className="font-medium text-foreground">
                        {work.publication_year ? `${work.publication_year} - ` : ""}
                        {doiHref ? (
                          <a
                            href={doiHref}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {work.title || "Untitled work"}
                          </a>
                        ) : openAlexHref ? (
                          <a
                            href={openAlexHref}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {work.title || "Untitled work"}
                          </a>
                        ) : (
                          <span>{work.title || "Untitled work"}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                        <span className="truncate">{formatAuthors(work.authorships)}</span>
                        <span aria-hidden>•</span>
                        <span className="truncate">
                          {(work.primary_location?.source?.display_name &&
                            `${work.primary_location.source.display_name}`) ||
                            "Venue n/a"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Search by a distinctive title fragment to find and copy a Work ID.
              </p>
            )}
          </CardContent>
        </Card>
      </main>
    </SiteShell>
  );
}
