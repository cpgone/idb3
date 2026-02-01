import { useEffect, useMemo, useRef, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { TrendingUp, Users, FileText, User, ArrowUpRight, Download } from "lucide-react";
import { authors } from "@/data/authors.generated";
import { useNavigate } from "react-router-dom";
import { SiteShell } from "@/components/SiteShell";
import { worksTable } from "@/data/worksTable.generated";
import { filterWorks } from "@/lib/blacklist";
import dashboardConfigJson from "@/data/dashboardConfig.json";
import insightsConfig from "../../data/config/insightsconfig.json";
import {
  Bar,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const defaultYearRangeConfig =
  (insightsConfig as {
    defaultYearRangeCharts?: { from?: number | null; to?: number | null };
    defaultYearRange?: { from?: number | null; to?: number | null };
  })?.defaultYearRangeCharts ||
  (insightsConfig as { defaultYearRange?: { from?: number | null; to?: number | null } })
    ?.defaultYearRange ||
  {};

const SimpleTooltip = ({ active, payload }: TooltipProps<number, string>) => {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload as { label?: string } | undefined;
  const label = data?.label ?? payload[0]?.name ?? "";
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground shadow-sm">
      <div className="font-semibold mb-1">{label}</div>
      {payload.map((entry) => {
        const name = entry.name ?? "";
        const value = entry.value;
        if (value == null) return null;
        const display = typeof value === "number" ? value.toLocaleString() : String(value);
        return (
          <div key={name} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: entry.color }} />
            <span>{name}:</span>
            <span className="font-semibold">{display}</span>
          </div>
        );
      })}
    </div>
  );
};

type DashboardConfig = {
  showStats: boolean;
  showCharts: boolean;
  showProgramsTable: boolean;
  statCards: {
    programs: boolean;
    members: boolean;
    topics: boolean;
    institutions: boolean;
    publications: boolean;
    citations: boolean;
  };
};

const dashboardConfig = (dashboardConfigJson as DashboardConfig) || {
  showStats: true,
  showCharts: true,
  showProgramsTable: false,
  statCards: {
    programs: false,
    members: true,
    topics: true,
    institutions: true,
    publications: true,
    citations: true,
  },
};

const Index = () => {
  const navigate = useNavigate();
  const INITIAL_PUBLICATIONS_LIMIT = 9;
  const INITIAL_TOPICS_LIMIT = 20;
  const PUBLICATIONS_STEP = 6;
  const TOPICS_STEP = 10;

  const memberCount = authors.length;
  const cleanWorks = useMemo(() => filterWorks(worksTable), []);

  const allYears = useMemo(() => {
    const years = new Set<number>();
    cleanWorks.forEach((w) => {
      if (typeof w.year === "number") years.add(w.year);
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [cleanWorks]);

  const [startYear, setStartYear] = useState<number | null>(null);
  const [endYear, setEndYear] = useState<number | null>(null);
  const [publicationLimit, setPublicationLimit] = useState<number>(INITIAL_PUBLICATIONS_LIMIT);
  const [topicLimit, setTopicLimit] = useState<number>(INITIAL_TOPICS_LIMIT);
  const [showTopics, setShowTopics] = useState(true);
  const [showPublications, setShowPublications] = useState(true);
  const [showCitations, setShowCitations] = useState(false);
  const [showInstitutions, setShowInstitutions] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!allYears.length) return;
    const minYear = allYears[0];
    const maxYear = allYears[allYears.length - 1];

    const clamp = (value: number | null | undefined) => {
      if (value == null || Number.isNaN(value)) return null;
      return Math.min(Math.max(value, minYear), maxYear);
    };

    const configuredFrom = clamp(defaultYearRangeConfig.from) ?? minYear;
    const configuredTo = clamp(defaultYearRangeConfig.to) ?? maxYear;
    const [resolvedStart, resolvedEnd] =
      configuredFrom <= configuredTo ? [configuredFrom, configuredTo] : [minYear, maxYear];

    setStartYear((prev) => {
      if (prev == null) return resolvedStart;
      const clamped = clamp(prev);
      return clamped ?? resolvedStart;
    });
    setEndYear((prev) => {
      if (prev == null) return resolvedEnd;
      const clamped = clamp(prev);
      return clamped ?? resolvedEnd;
    });
  }, [allYears, defaultYearRangeConfig.from, defaultYearRangeConfig.to]);

  const perYearAggregates = useMemo(() => {
    const map = new Map<
      number,
      { publications: number; citations: number; topics: Set<string>; institutions: Set<string> }
    >();
    for (const work of cleanWorks) {
      if (typeof work.year !== "number") continue;
      const entry =
        map.get(work.year) ??
        { publications: 0, citations: 0, topics: new Set<string>(), institutions: new Set<string>() };
      entry.publications += 1;
      entry.citations += work.citations || 0;
      (work.topics || []).forEach((t) => {
        if (t) entry.topics.add(t);
      });
      (work.institutions || []).forEach((inst) => {
        if (inst) entry.institutions.add(inst);
      });
      map.set(work.year, entry);
    }
    return map;
  }, [cleanWorks]);

  const totalPublicationsInRange = useMemo(() => {
    if (!allYears.length) return 0;
    const from = startYear ?? allYears[0];
    const to = endYear ?? allYears[allYears.length - 1];
    return cleanWorks.reduce((count, work) => {
      if (typeof work.year !== "number") return count;
      if (work.year < from || work.year > to) return count;
      return count + 1;
    }, 0);
  }, [allYears, startYear, endYear, cleanWorks]);

  const totalCitationsInRange = useMemo(() => {
    if (!allYears.length) return 0;
    const from = startYear ?? allYears[0];
    const to = endYear ?? allYears[allYears.length - 1];
    return cleanWorks.reduce((sum, work) => {
      if (typeof work.year !== "number") return sum;
      if (work.year < from || work.year > to) return sum;
      return sum + (work.citations || 0);
    }, 0);
  }, [allYears, startYear, endYear, cleanWorks]);

  const topicsTotals = useMemo(() => {
    if (!allYears.length) return { total: 0 };
    const from = startYear ?? allYears[0];
    const to = endYear ?? allYears[allYears.length - 1];
    const totalSet = new Set<string>();

    for (const [year, entry] of perYearAggregates.entries()) {
      if (year >= from && year <= to) {
        entry.topics.forEach((t) => totalSet.add(t));
      }
    }

    return {
      total: totalSet.size,
    };
  }, [allYears, startYear, endYear, perYearAggregates]);

  const institutionsTotals = useMemo(() => {
    if (!allYears.length) return { total: 0 };
    const from = startYear ?? allYears[0];
    const to = endYear ?? allYears[allYears.length - 1];
    const totalSet = new Set<string>();

    for (const [year, entry] of perYearAggregates.entries()) {
      if (year >= from && year <= to) {
        entry.institutions.forEach((i) => totalSet.add(i));
      }
    }

    return {
      total: totalSet.size,
    };
  }, [allYears, startYear, endYear, perYearAggregates]);

  const topicsChartData = useMemo(() => {
    const from = startYear ?? (allYears.length ? allYears[0] : undefined);
    const to = endYear ?? (allYears.length ? allYears[allYears.length - 1] : undefined);
    return Array.from(perYearAggregates.entries())
      .sort(([a], [b]) => a - b)
      .filter(([year]) => {
        if (from != null && year < from) return false;
        if (to != null && year > to) return false;
        return true;
      })
      .map(([year, entry]) => ({
        year,
        label: String(year),
        topics: entry.topics.size,
        publications: entry.publications,
        citations: entry.citations,
        institutions: entry.institutions.size,
      }));
  }, [allYears, startYear, endYear, perYearAggregates]);

  const statTrends = useMemo(() => {
    return {
      topics: topicsChartData.map((d) => d.topics),
      institutions: topicsChartData.map((d) => d.institutions),
      publications: topicsChartData.map((d) => d.publications),
      citations: topicsChartData.map((d) => d.citations),
    };
  }, [topicsChartData]);

  const handleExportChart = (format: "svg" | "png") => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const rect = svg.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const chartHeight = Math.max(1, Math.round(rect.height));
    const headerHeight = 36;
    const totalHeight = headerHeight + chartHeight;

    const chartInner = source
      .replace(/^<svg[^>]*>/, "")
      .replace(/<\/svg>$/, "");

    const estimateTextWidth = (text: string) => Math.max(10, text.length * 7);

    const legendItems = [
      showTopics ? { label: "Topics", color: "#22c55e" } : null,
      showInstitutions ? { label: "Institutions", color: "#0ea5e9" } : null,
      showPublications ? { label: "Publications", color: "#7c3aed" } : null,
      showCitations ? { label: "Citations", color: "#f97316" } : null,
    ].filter(Boolean) as { label: string; color: string }[];

    const legendWidth =
      legendItems.reduce((sum, item) => sum + 18 + estimateTextWidth(item.label) + 12, 0) - 12;
    let legendX = Math.max(0, width - legendWidth);
    const legendSvg = legendItems
      .map((item) => {
        const x = legendX;
        legendX += 18 + estimateTextWidth(item.label) + 12;
        return `<g transform="translate(${x},8)">
          <rect x="0" y="2" width="12" height="12" rx="2" fill="${item.color}" />
          <text x="18" y="13" fill="#111827" font-size="12" font-family="Inter, system-ui, -apple-system, sans-serif">${item.label}</text>
        </g>`;
      })
      .join("");

    const yearText =
      startYear != null && endYear != null
        ? `Year range: ${startYear} to ${endYear}`
        : startYear != null
          ? `Year range from ${startYear}`
          : "";

    const headerSvg = `
      <g>
        ${yearText ? `<text x="0" y="20" fill="#111827" font-size="12" font-family="Inter, system-ui, -apple-system, sans-serif">${yearText}</text>` : ""}
        ${legendSvg}
      </g>
    `;

    const combinedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}">
      <rect width="100%" height="100%" fill="${getComputedStyle(document.body).backgroundColor || "#ffffff"}" />
      ${headerSvg}
      <g transform="translate(0, ${headerHeight})">
        ${chartInner}
      </g>
    </svg>`;

    const blob = new Blob([combinedSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const timestamp = Date.now();

    if (format === "svg") {
      const svgLink = document.createElement("a");
      svgLink.href = url;
      svgLink.download = `topic-stats-${timestamp}.svg`;
      svgLink.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = totalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, width, totalHeight);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = `topic-stats-${timestamp}.png`;
        link.click();
        setTimeout(() => {
          URL.revokeObjectURL(pngUrl);
          URL.revokeObjectURL(url);
        }, 1000);
      }, "image/png");
    };
    img.src = url;
  };

  const sortedPublications = useMemo(() => {
    return [...cleanWorks]
      .sort((a, b) => {
        const aDate = a.publicationDate || `${a.year || 0}-01-01`;
        const bDate = b.publicationDate || `${b.year || 0}-01-01`;
        return bDate.localeCompare(aDate);
      })
      .filter(Boolean);
  }, [cleanWorks]);

  const recentPublications = useMemo(() => {
    return sortedPublications.slice(0, Math.max(0, publicationLimit));
  }, [sortedPublications, publicationLimit]);

  const sortedTopTopics = useMemo(() => {
    const counts = new Map<string, number>();
    const from = startYear ?? (allYears.length ? allYears[0] : undefined);
    const to = endYear ?? (allYears.length ? allYears[allYears.length - 1] : undefined);
    for (const work of cleanWorks) {
      if (work.year && from != null && work.year < from) continue;
      if (work.year && to != null && work.year > to) continue;
      (work.topics || []).forEach((t) => {
        if (!t) return;
        counts.set(t, (counts.get(t) || 0) + 1);
      });
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [allYears, startYear, endYear, cleanWorks]);

  const topTopics = useMemo(() => {
    return sortedTopTopics.slice(0, Math.max(0, topicLimit));
  }, [sortedTopTopics, topicLimit]);

  const hasMorePublications = publicationLimit < sortedPublications.length;
  const hasMoreTopics = topicLimit < sortedTopTopics.length;

  const buildRangeParams = () => {
    const from = startYear ?? (allYears.length ? allYears[0] : undefined);
    const to = endYear ?? (allYears.length ? allYears[allYears.length - 1] : undefined);
    const search = new URLSearchParams();
    if (from != null) search.set("fromYear", String(from));
    if (to != null) search.set("toYear", String(to));
    return search;
  };

  return (
    <SiteShell>
      <main className="container mx-auto px-4 py-4 sm:py-8">
        {dashboardConfig.showStats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-6 text-xs sm:text-sm">
            {dashboardConfig.statCards.members && (
              <StatCard
                title="Members"
                value={<span title={memberCount.toLocaleString()}>{memberCount}</span>}
                icon={Users}
                onClick={() => navigate("/members")}
                actionLabel="view"
              />
            )}
            {dashboardConfig.statCards.topics && (
              <StatCard
                title="Topics"
                value={<span title={topicsTotals.total.toLocaleString()}>{topicsTotals.total.toLocaleString()}</span>}
                trend={{ values: statTrends.topics }}
                actionLabel="view"
                onClick={() => navigate("/topics")}
              />
            )}
            {dashboardConfig.statCards.institutions && (
              <StatCard
                title="Institutions"
                value={<span title={institutionsTotals.total.toLocaleString()}>{institutionsTotals.total.toLocaleString()}</span>}
                trend={{ values: statTrends.institutions }}
                actionLabel="view"
                onClick={() => navigate("/institutions")}
              />
            )}
            {dashboardConfig.statCards.publications && (
              <StatCard
                title="Publications"
                value={<span title={totalPublicationsInRange.toLocaleString()}>{totalPublicationsInRange.toLocaleString()}</span>}
                trend={{ values: statTrends.publications }}
                actionLabel="view"
                onClick={() => navigate("/publications")}
              />
            )}
            {dashboardConfig.statCards.citations && (
              <StatCard
                title="Citations"
                value={<span title={totalCitationsInRange.toLocaleString()}>{totalCitationsInRange.toLocaleString()}</span>}
                trend={{ values: statTrends.citations }}
                actionLabel="view"
                onClick={() => navigate("/citations")}
              />
            )}
          </div>
        )}

        {/* Topic & institution trend (single chart) */}
        {dashboardConfig.showCharts && (
          <section className="mb-10">
            <Card className="border-border/60">
              <CardHeader className="relative flex flex-col gap-3 pb-2">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {allYears.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">Year range:</span>
                      <span className="font-semibold text-foreground">From</span>
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
                      <span className="font-semibold text-foreground">to</span>
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
                  <div className="ml-auto flex flex-wrap items-center gap-3 pr-10">
                    <button
                      type="button"
                      onClick={() => setShowTopics((prev) => !prev)}
                      className={`flex items-center gap-2 rounded px-2 py-1 transition-colors ${
                        showTopics ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      <span className="inline-block h-2 w-2 rounded-sm bg-[#22c55e]" />
                      <span>Topics</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInstitutions((prev) => !prev)}
                      className={`flex items-center gap-2 rounded px-2 py-1 transition-colors ${
                        showInstitutions ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      <span className="inline-block h-2 w-2 rounded-sm bg-[#0ea5e9]" />
                      <span>Institutions</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPublications((prev) => !prev)}
                      className={`flex items-center gap-2 rounded px-2 py-1 transition-colors ${
                        showPublications ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      <span className="inline-block h-2 w-2 rounded-sm bg-[#7c3aed]" />
                      <span>Publications</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCitations((prev) => !prev)}
                      className={`flex items-center gap-2 rounded px-2 py-1 transition-colors ${
                        showCitations ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      <span className="inline-block h-1.5 w-4 rounded-sm bg-[#f97316]" />
                      <span>Citations</span>
                    </button>
                  </div>
                </div>
                <div className="absolute right-3 top-3">
                  <div className="relative flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowExportMenu((prev) => !prev)}
                      className="inline-flex items-center justify-center rounded px-2 py-1 text-muted-foreground hover:bg-muted/60"
                      title="Export chart"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    {showExportMenu ? (
                      <div className="absolute right-0 top-9 z-10 min-w-[110px] rounded-md border border-border bg-popover p-1 shadow-lg">
                        <button
                          type="button"
                          className="w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            handleExportChart("svg");
                            setShowExportMenu(false);
                          }}
                        >
                          Export SVG
                        </button>
                        <button
                          type="button"
                          className="w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            handleExportChart("png");
                            setShowExportMenu(false);
                          }}
                        >
                          Export PNG
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2 pb-4">
                <div ref={chartRef} className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={topicsChartData}
                        margin={{ top: 0, right: 10, bottom: 12, left: 12 }}
                      >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="year"
                        stroke="#1f2937"
                        axisLine={{ stroke: "#1f2937", strokeWidth: 1.2 }}
                        tickLine={{ stroke: "#1f2937" }}
                        tick={{
                          fill: "#1f2937",
                          fontSize: 12,
                        }}
                        label={{
                          value: "Year",
                          position: "insideBottom",
                          offset: -6,
                          fill: "#1f2937",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      />
                      <YAxis
                        stroke="#1f2937"
                        axisLine={{ stroke: "#1f2937", strokeWidth: 1.2 }}
                        tickLine={{ stroke: "#1f2937" }}
                        width={34}
                        tick={{
                          fill: "#1f2937",
                          fontSize: 12,
                        }}
                        domain={[0, "auto"]}
                        label={{
                          value: "Count",
                          angle: -90,
                          position: "insideLeft",
                          dx: -8,
                          fill: "#1f2937",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      />
                      <Tooltip content={<SimpleTooltip />} />
                      {showTopics ? (
                        <Bar dataKey="topics" name="Topics (unique topics)" fill="#22c55e" />
                      ) : null}
                      {showInstitutions ? (
                        <Bar
                          dataKey="institutions"
                          name="Institutions"
                          fill="#0ea5e9"
                          opacity={0.85}
                        />
                      ) : null}
                      {showPublications ? (
                        <Bar
                          dataKey="publications"
                          name="Publications"
                          fill="#7c3aed"
                          opacity={0.8}
                        />
                      ) : null}
                      {showCitations ? (
                        <Line
                          type="monotone"
                          dataKey="citations"
                          name="Citations"
                          stroke="#f97316"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 4 }}
                        />
                      ) : null}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Recent publications + Trending topics side by side */}
        <section className="space-y-4 mb-10">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                  <FileText className="h-5 w-5 text-primary" />
                  <span>Recent publications</span>
                </h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90"
                  onClick={() => navigate("/publications")}
                >
                  View all
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {recentPublications.map((work) => (
                  <Card key={work.workId} className="border-border/60">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                      <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-1">
                        <FileText className="h-3 w-3 text-primary" />
                        <span>
                          {work.publicationDate
                            ? new Date(work.publicationDate).toLocaleString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : work.year || "Year n/a"}
                        </span>
                        {work.venue ? (
                          <>
                            <span aria-hidden>{"\u2022"}</span>
                            <span className="text-primary font-medium">{work.venue}</span>
                          </>
                        ) : null}
                      </div>
                          <h3 className="text-sm font-semibold text-primary leading-snug hover:underline">
                            {(() => {
                              const cleanedDoi = work.doi
                                ? work.doi
                                    .replace(/^https?:\/\/(www\.)?doi\.org\//i, "")
                                    .replace(/^doi:/i, "")
                                    .trim()
                                : "";
                              const href = cleanedDoi
                                ? `https://doi.org/${cleanedDoi}`
                                : work.workId
                                  ? `https://openalex.org/${work.workId}`
                                  : undefined;
                              return (
                                <a href={href} target="_blank" rel="noreferrer">
                                  {work.title}
                                </a>
                              );
                            })()}
                          </h3>
                          {work.allAuthors?.length ? (() => {
                            const names = work.allAuthors.filter(Boolean);
                            const fullList = names.join(", ");
                            return (
                              <p
                                className="text-xs text-muted-foreground mt-1"
                                title={fullList}
                              >
                                <User className="mr-1 inline-block h-3 w-3 text-primary" />
                                <span>{fullList || "Author n/a"}</span>
                              </p>
                            );
                          })() : null}
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div className="font-semibold text-foreground">
                            {(work.citations || 0).toLocaleString()}
                          </div>
                          <div>Citations</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {sortedPublications.length > INITIAL_PUBLICATIONS_LIMIT && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground shadow hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() =>
                      setPublicationLimit((prev) =>
                        Math.min(prev + PUBLICATIONS_STEP, sortedPublications.length),
                      )
                    }
                    disabled={!hasMorePublications}
                  >
                    Load more
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground shadow hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setPublicationLimit(sortedPublications.length)}
                    disabled={!hasMorePublications}
                  >
                    Load all
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <span>Trending topics</span>
                </h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90"
                  onClick={() => navigate("/topics")}
                >
                  View all
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
              <Card className="border-border/60">
                <CardContent className="p-3 pb-2">
                  <div className="grid gap-2">
                    {topTopics.map((topic, idx) => (
                      <div
                        key={topic.name}
                        className="flex items-center justify-between rounded-md border border-border/60 bg-card/60 px-3 py-2"
                        onClick={() => {
                          const search = buildRangeParams();
                          search.set("topic", topic.name);
                          navigate(`/publications?${search.toString()}`);
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <span className="text-muted-foreground">{idx + 1}.</span>
                          <span className="truncate text-primary hover:underline" title={topic.name}>
                            {topic.name}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {topic.count.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              {sortedTopTopics.length > INITIAL_TOPICS_LIMIT && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground shadow hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() =>
                      setTopicLimit((prev) => Math.min(prev + TOPICS_STEP, sortedTopTopics.length))
                    }
                    disabled={!hasMoreTopics}
                  >
                    Load more
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground shadow hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => setTopicLimit(sortedTopTopics.length)}
                    disabled={!hasMoreTopics}
                  >
                    Load all
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </SiteShell>
  );
};

export default Index;
