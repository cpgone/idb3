import { useEffect, useMemo, useRef, useState } from "react";
import { StatCard } from "@/components/StatCard";
import {
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  User,
  ArrowUpRight,
  Download,
  Sparkles,
  Target,
  Activity,
  Minus,
} from "lucide-react";
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

const parseHslString = (value: string) => {
  const parts = value.trim().replace(/,/g, " ").split(/\s+/);
  if (parts.length < 3) return null;
  const h = Number(parts[0]);
  const s = Number(parts[1].replace("%", ""));
  const l = Number(parts[2].replace("%", ""));
  if ([h, s, l].some((v) => Number.isNaN(v))) return null;
  return { h, s, l };
};

const hslToHex = (h: number, s: number, l: number) => {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h >= 0 && h < 60) [r, g, b] = [c, x, 0];
  else if (h >= 60 && h < 120) [r, g, b] = [x, c, 0];
  else if (h >= 120 && h < 180) [r, g, b] = [0, c, x];
  else if (h >= 180 && h < 240) [r, g, b] = [0, x, c];
  else if (h >= 240 && h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

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
    insights: boolean;
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
    insights: true,
    institutions: true,
    publications: true,
    citations: true,
  },
};

const thresholdsConfig =
  (insightsConfig as { insightThresholds?: any })?.insightThresholds || {
    strongSurge: { pubs: 2, cites: 2 },
    growingPriority: { pubs: 1.5, cites: 1.2 },
    impactLed: { cites: 1.5, pubsMax: 1 },
    outputSoftening: { pubs: 1.2, citesMax: 0.9 },
    declineDrop: 0.8,
  };

const deriveInsight = (pubsA: number, pubsB: number, citesA: number, citesB: number) => {
  const pubsGrowth = pubsA === 0 ? (pubsB > 0 ? Infinity : 0) : pubsB / pubsA;
  const citesGrowth = citesA === 0 ? (citesB > 0 ? Infinity : 0) : citesB / citesA;

  const strongSurge = thresholdsConfig.strongSurge || { pubs: 2, cites: 2 };
  const growingPriority = thresholdsConfig.growingPriority || { pubs: 1.5, cites: 1.2 };
  const impactLed = thresholdsConfig.impactLed || { cites: 1.5, pubsMax: 1 };
  const outputSoftening = thresholdsConfig.outputSoftening || { pubs: 1.2, citesMax: 0.9 };
  const declineDrop = typeof thresholdsConfig.declineDrop === "number" ? thresholdsConfig.declineDrop : 0.8;

  if (pubsA === 0 && pubsB > 0) return "Emerging in period B";
  if (pubsA > 0 && pubsB === 0) return "Absent in period B";
  if (pubsGrowth >= strongSurge.pubs && citesGrowth >= strongSurge.cites)
    return "Strong surge in output and impact";
  if (pubsGrowth >= growingPriority.pubs && citesGrowth >= growingPriority.cites)
    return "Growing priority with rising impact";
  if (pubsGrowth >= outputSoftening.pubs && citesGrowth < outputSoftening.citesMax)
    return "Output rising, impact softening";
  if (pubsGrowth < declineDrop && citesGrowth < declineDrop) return "Declining emphasis";
  if (citesGrowth >= impactLed.cites && pubsGrowth <= (impactLed.pubsMax ?? 1))
    return "Impact rising faster than output";
  return "Stable focus";
};

const buildAggregates = (
  works: (typeof worksTable)[number][],
  from: number,
  to: number,
) => {
  const map = new Map<string, { pubs: number; cites: number }>();
  works.forEach((work) => {
    if (typeof work.year !== "number") return;
    if (work.year < from || work.year > to) return;
    (work.topics || []).forEach((topic) => {
      if (!topic) return;
      const current = map.get(topic) || { pubs: 0, cites: 0 };
      current.pubs += 1;
      current.cites += work.citations || 0;
      map.set(topic, current);
    });
  });
  return map;
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
  const [showCoAuthors, setShowCoAuthors] = useState(false);
  const [chartSeriesColors, setChartSeriesColors] = useState({
    topics: "#22c55e",
    institutions: "#0ea5e9",
    publications: "#7c3aed",
    citations: "#f97316",
    coAuthors: "#f59e0b",
  });
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    const resolveColor = (varName: string, fallback: string) => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(varName);
      const parsed = raw ? parseHslString(raw) : null;
      return parsed ? hslToHex(parsed.h, parsed.s, parsed.l) : fallback;
    };
    const updateColors = () => {
      setChartSeriesColors({
        topics: resolveColor("--chart-1", "#22c55e"),
        institutions: resolveColor("--chart-2", "#0ea5e9"),
        publications: resolveColor("--chart-3", "#7c3aed"),
        citations: resolveColor("--chart-4", "#f97316"),
        coAuthors: resolveColor("--chart-5", "#f59e0b"),
      });
    };
    updateColors();
    const observer = new MutationObserver(updateColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    return () => observer.disconnect();
  }, []);

  const perYearAggregates = useMemo(() => {
    const map = new Map<
      number,
      { publications: number; citations: number; topics: Set<string>; institutions: Set<string>; coAuthors: Set<string> }
    >();
    for (const work of cleanWorks) {
      if (typeof work.year !== "number") continue;
      const entry =
        map.get(work.year) ??
        {
          publications: 0,
          citations: 0,
          topics: new Set<string>(),
          institutions: new Set<string>(),
          coAuthors: new Set<string>(),
        };
      entry.publications += 1;
      entry.citations += work.citations || 0;
      (work.topics || []).forEach((t) => {
        if (t) entry.topics.add(t);
      });
      (work.institutions || []).forEach((inst) => {
        if (inst) entry.institutions.add(inst);
      });
      (work.allAuthors || []).forEach((author) => {
        if (author) entry.coAuthors.add(author);
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
        coAuthors: entry.coAuthors.size,
      }));
  }, [allYears, startYear, endYear, perYearAggregates]);

  const insightCategories = [
    { key: "emerging", label: "Emerging", icon: Sparkles },
    { key: "declining", label: "Declining", icon: TrendingDown },
    { key: "strongSurge", label: "Strong surge", icon: TrendingUp },
    { key: "growingPriority", label: "Growing priority", icon: ArrowUpRight },
    { key: "impactLed", label: "Impact-led", icon: Target },
    { key: "outputSoftening", label: "Output rising", icon: Activity },
    { key: "stable", label: "Stable", icon: Minus },
  ] as const;

  const insightCounts = useMemo(() => {
    const counts: Record<(typeof insightCategories)[number]["key"], number> = {
      emerging: 0,
      declining: 0,
      strongSurge: 0,
      growingPriority: 0,
      impactLed: 0,
      outputSoftening: 0,
      stable: 0,
    };
    if (!allYears.length) return counts;
    const min = allYears[0];
    const max = allYears[allYears.length - 1];

    const clamp = (value?: number | null) => {
      if (value == null || Number.isNaN(value)) return null;
      return Math.min(Math.max(value, min), max);
    };

    const defaultsA =
      (insightsConfig as { insightsDefaultPeriodA?: { from?: number; to?: number } })
        ?.insightsDefaultPeriodA || {};
    const defaultsB =
      (insightsConfig as { insightsDefaultPeriodB?: { from?: number; to?: number } })
        ?.insightsDefaultPeriodB || {};

    let aFrom = clamp(defaultsA.from) ?? min;
    let aTo = clamp(defaultsA.to) ?? max;
    if (aFrom > aTo) [aFrom, aTo] = [aTo, aFrom];

    let bFrom = clamp(defaultsB.from) ?? min;
    let bTo = clamp(defaultsB.to) ?? max;
    if (bFrom > bTo) [bFrom, bTo] = [bTo, bFrom];

    const aggA = buildAggregates(cleanWorks, aFrom, aTo);
    const aggB = buildAggregates(cleanWorks, bFrom, bTo);
    const topics = new Set<string>([...aggA.keys(), ...aggB.keys()]);

    topics.forEach((topic) => {
      const a = aggA.get(topic) || { pubs: 0, cites: 0 };
      const b = aggB.get(topic) || { pubs: 0, cites: 0 };
      const insight = deriveInsight(a.pubs, b.pubs, a.cites, b.cites);
      if (insight === "Emerging in period B") counts.emerging += 1;
      else if (insight === "Absent in period B" || insight === "Declining emphasis")
        counts.declining += 1;
      else if (insight === "Strong surge in output and impact") counts.strongSurge += 1;
      else if (insight === "Growing priority with rising impact") counts.growingPriority += 1;
      else if (insight === "Impact rising faster than output") counts.impactLed += 1;
      else if (insight === "Output rising, impact softening") counts.outputSoftening += 1;
      else if (insight === "Stable focus") counts.stable += 1;
    });
    return counts;
  }, [allYears, cleanWorks]);

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
      showTopics ? { label: "Topics", color: chartSeriesColors.topics } : null,
      showInstitutions ? { label: "Institutions", color: chartSeriesColors.institutions } : null,
      showPublications ? { label: "Publications", color: chartSeriesColors.publications } : null,
      showCitations ? { label: "Citations", color: chartSeriesColors.citations } : null,
      showCoAuthors ? { label: "Co-authors", color: chartSeriesColors.coAuthors } : null,
    ].filter(Boolean) as { label: string; color: string }[];

    const legendWidth =
      legendItems.reduce((sum, item) => sum + 18 + estimateTextWidth(item.label) + 12, 0) - 12;
    let legendX = Math.max(0, width - legendWidth);
    const headerTextColor = getComputedStyle(document.body).color || "#111827";
    const legendSvg = legendItems
      .map((item) => {
        const x = legendX;
        legendX += 18 + estimateTextWidth(item.label) + 12;
        return `<g transform="translate(${x},8)">
          <rect x="0" y="2" width="12" height="12" rx="2" fill="${item.color}" />
          <text x="18" y="13" fill="${headerTextColor}" font-size="12" font-family="Inter, system-ui, -apple-system, sans-serif">${item.label}</text>
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
        ${yearText ? `<text x="0" y="20" fill="${headerTextColor}" font-size="12" font-family="Inter, system-ui, -apple-system, sans-serif">${yearText}</text>` : ""}
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6 text-xs sm:text-sm">
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
            {dashboardConfig.statCards.insights && (
              <StatCard
                title="Insights"
                value={
                  <div className="flex flex-wrap items-center gap-2">
                    {insightCategories.map(({ key, label, icon: Icon }) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 text-muted-foreground"
                        title={label}
                      >
                        <Icon className="h-3.5 w-3.5 text-primary" />
                        <span className="text-foreground">{insightCounts[key]}</span>
                      </span>
                    ))}
                  </div>
                }
                valueClassName="text-xs sm:text-sm font-semibold"
                actionLabel="view"
                onClick={() => navigate("/insights")}
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
                    {[
                      { key: "topics", label: "Topics", visible: showTopics, toggle: setShowTopics },
                      { key: "institutions", label: "Institutions", visible: showInstitutions, toggle: setShowInstitutions },
                      { key: "publications", label: "Publications", visible: showPublications, toggle: setShowPublications },
                      { key: "citations", label: "Citations", visible: showCitations, toggle: setShowCitations },
                      { key: "coAuthors", label: "Co-authors", visible: showCoAuthors, toggle: setShowCoAuthors },
                    ].map(({ key, label, visible, toggle }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggle((prev) => !prev)}
                        className={`flex items-center gap-2 rounded px-2 py-1 text-[11px] transition-colors ${
                          visible ? "text-foreground" : "text-muted-foreground"
                        }`}
                        aria-pressed={visible}
                      >
                        <input
                          type="color"
                          value={chartSeriesColors[key as keyof typeof chartSeriesColors]}
                          onChange={(event) =>
                            setChartSeriesColors((prev) => ({
                              ...prev,
                              [key]: event.target.value,
                            }))
                          }
                          className={`h-4 w-4 cursor-pointer rounded-full border border-border bg-transparent p-0 ${
                            visible ? "" : "opacity-50"
                          }`}
                          aria-label={`Set ${label} color`}
                          onClick={(event) => event.stopPropagation()}
                        />
                        <span className={visible ? "" : "opacity-60"}>{label}</span>
                      </button>
                    ))}
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
                        stroke="hsl(var(--muted-foreground))"
                        axisLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.2 }}
                        tickLine={{ stroke: "hsl(var(--muted-foreground))" }}
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 12,
                        }}
                        label={{
                          value: "Year",
                          position: "insideBottom",
                          offset: -6,
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        axisLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.2 }}
                        tickLine={{ stroke: "hsl(var(--muted-foreground))" }}
                        width={34}
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 12,
                        }}
                        domain={[0, "auto"]}
                      />
                      <Tooltip content={<SimpleTooltip />} />
                      {showTopics ? (
                        <Bar
                          dataKey="topics"
                          name="Topics (unique topics)"
                          fill={chartSeriesColors.topics}
                        />
                      ) : null}
                      {showInstitutions ? (
                        <Bar
                          dataKey="institutions"
                          name="Institutions"
                          fill={chartSeriesColors.institutions}
                          opacity={0.85}
                        />
                      ) : null}
                      {showPublications ? (
                        <Bar
                          dataKey="publications"
                          name="Publications"
                          fill={chartSeriesColors.publications}
                          opacity={0.8}
                        />
                      ) : null}
                      {showCitations ? (
                        <Line
                          type="monotone"
                          dataKey="citations"
                          name="Citations"
                          stroke={chartSeriesColors.citations}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 4 }}
                        />
                      ) : null}
                      {showCoAuthors ? (
                        <Line
                          type="monotone"
                          dataKey="coAuthors"
                          name="Co-authors"
                          stroke={chartSeriesColors.coAuthors}
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
