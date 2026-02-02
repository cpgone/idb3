import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SiteShell } from "@/components/SiteShell";
import { worksTable } from "@/data/worksTable.generated";
import { filterWorks } from "@/lib/blacklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Download,
  FileText,
  Linkedin,
  Link as LinkIcon,
  FileText as FileTextIcon,
  ArrowLeft,
  Search,
  ArrowUpDown,
  Info,
  Tag,
  BookOpen,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend as RechartsLegend,
  ReferenceArea,
} from "recharts";
import insightsConfig from "../../data/config/insightsconfig.json";

type Range = { from: number | null; to: number | null };

type TopicInsight = {
  topic: string;
  pubsA: number;
  pubsB: number;
  citesA: number;
  citesB: number;
  pubsDeltaPct: number | null;
  citesDeltaPct: number | null;
  insight: string;
};

const thresholdsConfig =
  (insightsConfig as { insightThresholds?: any })?.insightThresholds || {
    strongSurge: { pubs: 2, cites: 2 },
    growingPriority: { pubs: 1.5, cites: 1.2 },
    impactLed: { cites: 1.5, pubsMax: 1 },
    outputSoftening: { pubs: 1.2, citesMax: 0.9 },
    declineDrop: 0.8,
  };

const formatPct = (value: number | null) => {
  if (value === Infinity) return "New";
  if (value === -Infinity) return "Absent";
  if (value == null || !isFinite(value)) return "N/A";
  const pct = Math.round(value * 100);
  if (pct === 0) return "Stable";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
};

const deltaClass = (value: number | null) => {
  if (value === Infinity) return "text-emerald-600";
  if (value === -Infinity) return "text-rose-700";
  if (value == null || !isFinite(value)) return "text-muted-foreground";
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-rose-700";
  return "text-slate-600";
};

const classifyMetricChange = (delta: number | null) => {
  if (delta === Infinity) return "Emerging";
  if (delta === -Infinity) return "Absent";
  if (delta == null || !isFinite(delta)) return "N/A";
  if (delta >= 0.5) return "Rising";
  if (delta >= 0.2) return "Up";
  if (delta <= -0.5) return "Declining";
  if (delta <= -0.2) return "Softening";
  return "Stable";
};

const badgeTone = (status: string) => {
  if (status === "Emerging" || status === "Rising" || status === "Up") return "bg-emerald-100 text-emerald-700";
  if (status === "Declining" || status === "Softening" || status === "Absent") return "bg-rose-100 text-rose-700";
  if (status === "Stable") return "bg-slate-100 text-slate-700";
  return "bg-muted text-muted-foreground";
};

const deriveInsight = (row: TopicInsight) => {
  const { pubsA, pubsB, citesA, citesB } = row;
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

const buildAggregates = (from: number | null, to: number | null, works: typeof worksTable) => {
  const map = new Map<string, { pubs: number; cites: number }>();
  works.forEach((work) => {
    if (typeof work.year !== "number") return;
    if (from != null && work.year < from) return;
    if (to != null && work.year > to) return;
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

const InsightsPage = () => {
  const navigate = useNavigate();
  const cleanWorks = useMemo(() => filterWorks(worksTable), []);
  const { toast } = useToast();

  const allYears = useMemo(() => {
    const years = new Set<number>();
    cleanWorks.forEach((w) => {
      if (typeof w.year === "number") years.add(w.year);
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [cleanWorks]);

  const [rangeA, setRangeA] = useState<Range>({ from: null, to: null });
  const [rangeB, setRangeB] = useState<Range>({ from: null, to: null });
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<
    "topic" | "pubsA" | "pubsB" | "pubsDelta" | "citesA" | "citesB" | "citesDelta" | "insight"
  >("pubsB");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showLegend, setShowLegend] = useState(false);
  const [showChart, setShowChart] = useState(true);
  const [compareMode, setCompareMode] = useState(true);
  const [chartScale, setChartScale] = useState<"linear" | "log">("linear");
  const [xDomain, setXDomain] = useState<[number, number] | null>(null);
  const [yDomain, setYDomain] = useState<[number, number] | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<number | null>(null);
  const [panDomain, setPanDomain] = useState<[number, number] | null>(null);
  const [panStartX, setPanStartX] = useState<number | null>(null);
  const [panStartY, setPanStartY] = useState<number | null>(null);
  const [panDomainY, setPanDomainY] = useState<[number, number] | null>(null);
  const [axisPanMode, setAxisPanMode] = useState<"x" | "y" | null>(null);
  const [focusedAxis, setFocusedAxis] = useState<"x" | "y" | null>(null);
  const panWidthRef = useRef<number | null>(null);
  const panHeightRef = useRef<number | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [showPubsSeries, setShowPubsSeries] = useState(true);
  const [showCitesSeries, setShowCitesSeries] = useState(false);
  const [visibleRows, setVisibleRows] = useState(25);
  const [topicColors, setTopicColors] = useState<Record<string, string>>({});
  const initializedSelection = useRef(false);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [showChartExportMenu, setShowChartExportMenu] = useState(false);

  useEffect(() => {
    if (!allYears.length) return;
    const min = allYears[0];
    const max = allYears[allYears.length - 1];

    const clamp = (value: number | null | undefined) => {
      if (value == null || Number.isNaN(value)) return null;
      return Math.min(Math.max(value, min), max);
    };

    const normalizeRange = (from: number | null | undefined, to: number | null | undefined) => {
      let f = clamp(from) ?? min;
      let t = clamp(to) ?? max;
      if (f > t) {
        f = min;
        t = max;
      }
      return { from: f, to: t };
    };

    const defaultA =
      (insightsConfig as { insightsDefaultPeriodA?: { from?: number; to?: number } })?.insightsDefaultPeriodA || {};
    const defaultB =
      (insightsConfig as { insightsDefaultPeriodB?: { from?: number; to?: number } })?.insightsDefaultPeriodB || {};

    // If Period A "from" is missing, use the oldest; if Period B "to" is missing, use the newest.
    const resolvedAFrom = defaultA.from ?? min;
    const resolvedATo = defaultA.to;
    const resolvedBFrom = defaultB.from;
    const resolvedBTo = defaultB.to ?? max;

    setRangeA(normalizeRange(resolvedAFrom, resolvedATo));
    setRangeB(normalizeRange(resolvedBFrom, resolvedBTo));
  }, [allYears]);

  useEffect(() => {
    if (compareMode) return;
    if (sortKey === "topic" || sortKey === "pubsA" || sortKey === "citesA") return;
    setSortKey("pubsA");
  }, [compareMode, sortKey]);

  useEffect(() => {
    if (compareMode || !allYears.length) return;
    const min = allYears[0];
    const max = allYears[allYears.length - 1];
    setRangeA({ from: min, to: max });
  }, [compareMode, allYears]);

  const insights = useMemo<TopicInsight[]>(() => {
    if (!allYears.length) return [];
    const aggA = buildAggregates(rangeA.from, rangeA.to, cleanWorks);
    const aggB = compareMode ? buildAggregates(rangeB.from, rangeB.to, cleanWorks) : new Map();
    const topics = new Set<string>(compareMode ? [...aggA.keys(), ...aggB.keys()] : [...aggA.keys()]);
    const rows: TopicInsight[] = [];
    topics.forEach((topic) => {
      const a = aggA.get(topic) || { pubs: 0, cites: 0 };
      const b = aggB.get(topic) || { pubs: 0, cites: 0 };
      const pubsDeltaPct = compareMode
        ? a.pubs === 0
          ? b.pubs > 0
            ? Infinity
            : 0
          : b.pubs === 0
            ? -Infinity
            : (b.pubs - a.pubs) / a.pubs
        : null;
      const citesDeltaPct = compareMode
        ? a.cites === 0
          ? b.cites > 0
            ? Infinity
            : 0
          : b.cites === 0
            ? -Infinity
            : (b.cites - a.cites) / a.cites
        : null;
      const row: TopicInsight = {
        topic,
        pubsA: a.pubs,
        pubsB: b.pubs,
        citesA: a.cites,
        citesB: b.cites,
        pubsDeltaPct,
        citesDeltaPct,
        insight: "",
      };
      row.insight = compareMode ? deriveInsight(row) : "";
      rows.push(row);
    });
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? rows.filter(
          (row) =>
            row.topic.toLowerCase().includes(query) ||
            (compareMode && row.insight.toLowerCase().includes(query)),
        )
      : rows;
    const dir = sortDir === "asc" ? 1 : -1;
    const resolvedSortKey = compareMode
      ? sortKey
      : sortKey === "topic" || sortKey === "pubsA" || sortKey === "citesA"
        ? sortKey
        : "pubsA";
    const sorted = [...filtered].sort((a, b) => {
      const compare = (x: number | null, y: number | null) => {
        const xv = x ?? -Infinity;
        const yv = y ?? -Infinity;
        if (xv === Infinity && yv !== Infinity) return 1;
        if (yv === Infinity && xv !== Infinity) return -1;
        return (xv - yv) * dir;
      };
      if (resolvedSortKey === "topic") return a.topic.localeCompare(b.topic) * dir;
      if (resolvedSortKey === "insight") return a.insight.localeCompare(b.insight) * dir;
      if (resolvedSortKey === "pubsA") return compare(a.pubsA, b.pubsA);
      if (resolvedSortKey === "citesA") return compare(a.citesA, b.citesA);
      if (resolvedSortKey === "pubsDelta") return compare(a.pubsDeltaPct, b.pubsDeltaPct);
      if (resolvedSortKey === "citesDelta") return compare(a.citesDeltaPct, b.citesDeltaPct);
      if (resolvedSortKey === "pubsB") return compare(a.pubsB, b.pubsB);
      if (resolvedSortKey === "citesB") return compare(a.citesB, b.citesB);
      return 0;
    });
    return sorted;
  }, [
    allYears.length,
    cleanWorks,
    rangeA.from,
    rangeA.to,
    rangeB.from,
    rangeB.to,
    searchQuery,
    sortDir,
    sortKey,
    compareMode,
  ]);

  const toggleTopicSelection = (topic: string) => {
    setSelectedTopics((prev) => (prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]));
  };

  const chartYearRange = useMemo(() => {
    if (!allYears.length) return { from: null as number | null, to: null as number | null };
    const minYear = allYears[0];
    const maxYear = allYears[allYears.length - 1];
    const start = compareMode ? Math.min(rangeA.from ?? minYear, rangeB.from ?? minYear) : (rangeA.from ?? minYear);
    const end = compareMode ? Math.max(rangeA.to ?? maxYear, rangeB.to ?? maxYear) : (rangeA.to ?? maxYear);
    return { from: start, to: end };
  }, [allYears, rangeA.from, rangeA.to, rangeB.from, rangeB.to, compareMode]);

  const chartData = useMemo(() => {
    if (!selectedTopics.length || chartYearRange.from == null || chartYearRange.to == null) return [];
    const years: number[] = [];
    for (let y = chartYearRange.from; y <= chartYearRange.to; y += 1) years.push(y);
    const byTopicYear = new Map<
      string,
      {
        pubs: Map<number, number>;
        cites: Map<number, number>;
      }
    >();
    selectedTopics.forEach((topic) => {
      byTopicYear.set(topic, { pubs: new Map(), cites: new Map() });
    });
    cleanWorks.forEach((work) => {
      if (typeof work.year !== "number") return;
      if (work.year < chartYearRange.from || work.year > chartYearRange.to) return;
      (work.topics || []).forEach((topic) => {
        if (!topic || !byTopicYear.has(topic)) return;
        const entry = byTopicYear.get(topic)!;
        entry.pubs.set(work.year, (entry.pubs.get(work.year) || 0) + 1);
        entry.cites.set(work.year, (entry.cites.get(work.year) || 0) + (work.citations || 0));
      });
    });
    return years.map((year) => {
      const row: Record<string, number | string> = { year };
      selectedTopics.forEach((topic) => {
        const entry = byTopicYear.get(topic);
        const pubsVal = entry?.pubs.get(year) ?? 0;
        const citesVal = entry?.cites.get(year) ?? 0;
        const safePubs = chartScale === "log" && pubsVal === 0 ? 0.1 : pubsVal;
        const safeCites = chartScale === "log" && citesVal === 0 ? 0.1 : citesVal;
        row[`${topic}-pubs`] = safePubs;
        row[`${topic}-cites`] = safeCites;
      });
      return row;
    });
  }, [selectedTopics, chartYearRange.from, chartYearRange.to, cleanWorks, chartScale]);

  const chartExtent = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const [xMin, xMax] = xDomain ?? [chartYearRange.from, chartYearRange.to];
    chartData.forEach((row) => {
      const year = row.year as number | undefined;
      if (typeof year !== "number") return;
      if (xMin != null && year < xMin) return;
      if (xMax != null && year > xMax) return;
      selectedTopics.forEach((topic) => {
        if (showPubsSeries) {
          const p = row[`${topic}-pubs`] as number | undefined;
          if (typeof p === "number") {
            min = Math.min(min, p);
            max = Math.max(max, p);
          }
        }
        if (showCitesSeries) {
          const c = row[`${topic}-cites`] as number | undefined;
          if (typeof c === "number") {
            min = Math.min(min, c);
            max = Math.max(max, c);
          }
        }
      });
    });
    if (!isFinite(min) || !isFinite(max)) return null;
    if (min === max) return { min: Math.max(0, min - 1), max: max + 1 };
    return { min, max };
  }, [chartData, selectedTopics, xDomain, chartYearRange.from, chartYearRange.to, showPubsSeries, showCitesSeries]);

  const xTicks = useMemo(() => {
    if (!chartData.length) return undefined;
    const years = chartData.map((row) => row.year as number).filter((y) => typeof y === "number");
    if (years.length <= 8) return years;
    const step = Math.ceil(years.length / 8);
    return years.filter((_, idx) => idx % step === 0 || idx === years.length - 1);
  }, [chartData]);

  const xAxisDomain = useMemo<[number | "auto", number | "auto"]>(() => {
    if (xDomain) return xDomain;
    if (chartYearRange.from != null && chartYearRange.to != null) return [chartYearRange.from, chartYearRange.to];
    return ["auto", "auto"];
  }, [xDomain, chartYearRange.from, chartYearRange.to]);

  const yAxisDomain = useMemo<[number | "auto", number | "auto"]>(() => {
    if (yDomain) return yDomain;
    if (!chartExtent) return ["auto", "auto"];
    if (chartScale === "log") return [Math.max(0.1, chartExtent.min || 0.1), "auto"];
    const pad = Math.max(1, (chartExtent.max - chartExtent.min) * 0.08);
    return [Math.max(0, chartExtent.min - pad), chartExtent.max + pad];
  }, [yDomain, chartExtent, chartScale]);

  const resetAxes = () => {
    setXDomain(null);
    setYDomain(null);
    setDragStart(null);
    setDragEnd(null);
    setChartScale("linear");
    setIsPanning(false);
    setPanStart(null);
    setPanDomain(null);
    setPanStartX(null);
    setPanStartY(null);
    setPanDomainY(null);
    setAxisPanMode(null);
    setFocusedAxis(null);
    panWidthRef.current = null;
    panHeightRef.current = null;
  };

  const resolveActiveYear = (state: any) => {
    if (typeof state?.activeLabel === "number") return state.activeLabel as number;
    const payloadYear = state?.activePayload?.[0]?.payload?.year;
    return typeof payloadYear === "number" ? payloadYear : null;
  };

  const resolveChartX = (state: any) => {
    return typeof state?.chartX === "number" ? state.chartX : null;
  };

  const resolveChartY = (state: any) => {
    return typeof state?.chartY === "number" ? state.chartY : null;
  };

  const clampYDomain = useCallback(
    (start: number, end: number) => {
      if (!chartExtent) return [start, end] as [number, number];
      const min = chartExtent.min;
      const max = chartExtent.max;
      const span = end - start;
      if (span >= max - min) return [min, max] as [number, number];
      const clampedStart = Math.max(min, Math.min(start, max - span));
      return [clampedStart, clampedStart + span] as [number, number];
    },
    [chartExtent],
  );

  const clampXDomain = useCallback(
    (start: number, end: number) => {
      if (chartYearRange.from == null || chartYearRange.to == null) return [start, end] as [number, number];
      const min = chartYearRange.from;
      const max = chartYearRange.to;
      const span = end - start;
      if (span >= max - min) return [min, max] as [number, number];
      const clampedStart = Math.max(min, Math.min(start, max - span));
      return [clampedStart, clampedStart + span] as [number, number];
    },
    [chartYearRange.from, chartYearRange.to],
  );

  const resolveAxisMode = (
    chartX: number | null,
    chartY: number | null,
    width: number | null,
    height: number | null,
  ): "x" | "y" => {
    if (chartY != null && height != null && chartY >= height - 40) return "x";
    if (chartX != null && chartX <= 60) return "y";
    return "x";
  };

  const handleWheelZoomY = useCallback(
    (event: {
      deltaY: number;
      shiftKey: boolean;
      preventDefault: () => void;
      stopPropagation: () => void;
    }) => {
      event.preventDefault();
      event.stopPropagation();
      const factor = event.deltaY > 0 ? 1.1 : 0.9;
      const zoomXAxis =
        focusedAxis === "x" ? true : focusedAxis === "y" ? false : event.shiftKey;
      if (zoomXAxis) {
        if (chartYearRange.from == null || chartYearRange.to == null) return;
        const [currentMin, currentMax] = xDomain ?? [chartYearRange.from, chartYearRange.to];
        const span = Math.max(1, currentMax - currentMin);
        const center = currentMin + span / 2;
        const newSpan = Math.max(1, span * factor);
        const nextMin = center - newSpan / 2;
        const nextMax = center + newSpan / 2;
        setXDomain(clampXDomain(nextMin, nextMax));
        return;
      }
      if (!chartExtent) return;
      const [currentMin, currentMax] = yDomain ?? [chartExtent.min, chartExtent.max];
      const span = Math.max(1, currentMax - currentMin);
      const center = currentMin + span / 2;
      let newSpan = span * factor;
      if (chartScale === "log") {
        const logMin = Math.log10(Math.max(currentMin, 0.1));
        const logMax = Math.log10(Math.max(currentMax, 0.1));
        const logSpan = Math.max(0.1, logMax - logMin) * factor;
        const logCenter = (logMin + logMax) / 2;
        const newLogMin = logCenter - logSpan / 2;
        const newLogMax = logCenter + logSpan / 2;
        setYDomain([Math.max(0.1, 10 ** newLogMin), Math.max(0.2, 10 ** newLogMax)]);
        return;
      }
      newSpan = Math.max(1, newSpan);
      const newMin = Math.max(0, center - newSpan / 2);
      const newMax = center + newSpan / 2;
      setYDomain([newMin, newMax]);
    },
    [
      chartExtent,
      chartScale,
      chartYearRange.from,
      chartYearRange.to,
      clampXDomain,
      xDomain,
      yDomain,
      focusedAxis,
    ],
  );

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      handleWheelZoomY(event);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [handleWheelZoomY]);

  const handleDragStart = (state: any, event?: any) => {
    const year = resolveActiveYear(state);
    if (year == null) return;
    if (event?.shiftKey) {
      const year = resolveActiveYear(state);
      if (year == null) return;
      setDragStart(year);
      setDragEnd(year);
      return;
    }
    {
      const baseDomain =
        xDomain ?? (chartYearRange.from != null && chartYearRange.to != null ? [chartYearRange.from, chartYearRange.to] : null);
      if (!baseDomain) return;
      const year = resolveActiveYear(state);
      const chartX = resolveChartX(state);
      const chartY = resolveChartY(state);
      const width = chartRef.current?.getBoundingClientRect().width ?? null;
      const height = chartRef.current?.getBoundingClientRect().height ?? null;
      panWidthRef.current = width && width > 0 ? width : null;
      panHeightRef.current = height && height > 0 ? height : null;

      // Axis drag zones: left gutter pans Y, bottom gutter pans X (Plotly-like)
      const axisMode = resolveAxisMode(chartX, chartY, panWidthRef.current, panHeightRef.current);
      setAxisPanMode(axisMode);
      setFocusedAxis(axisMode);

      if (axisMode === "y") {
        if (!chartExtent) return;
        const baseY: [number, number] =
          yDomain ?? [chartExtent.min, chartExtent.max];
        setIsPanning(true);
        setPanStart(year ?? null);
        setPanStartX(chartX);
        setPanStartY(chartY);
        setPanDomain(baseDomain);
        setPanDomainY(baseY);
        return;
      }
      if (!xDomain && chartYearRange.from != null && chartYearRange.to != null) {
        const fullSpan = chartYearRange.to - chartYearRange.from;
        const windowSpan = Math.max(2, Math.round(fullSpan * 0.4));
        const center =
          year != null ? year : (chartYearRange.from + chartYearRange.to) / 2;
        const rawStart = center - windowSpan / 2;
        const clampedStart = Math.max(chartYearRange.from, Math.min(rawStart, chartYearRange.to - windowSpan));
        const windowDomain: [number, number] = [clampedStart, clampedStart + windowSpan];
        setXDomain(windowDomain);
        setIsPanning(true);
        setPanStart(year ?? null);
        setPanStartX(chartX);
        setPanDomain(windowDomain);
        return;
      }
      setIsPanning(true);
      setPanStart(year ?? null);
      setPanStartX(chartX);
      setPanDomain(baseDomain);
      return;
    }
  };

  const handleDragMove = (state: any) => {
    const year = resolveActiveYear(state);
    if (isPanning && panDomainY && panHeightRef.current) {
      const chartY = resolveChartY(state);
      if (chartY != null && panStartY != null) {
        const deltaPx = chartY - panStartY;
        const span = panDomainY[1] - panDomainY[0];
        const deltaVal = (deltaPx / panHeightRef.current) * span;
        let nextStart = panDomainY[0] + deltaVal;
        let nextEnd = panDomainY[1] + deltaVal;
        if (chartScale === "log") {
          nextStart = Math.max(0.1, nextStart);
          nextEnd = Math.max(nextStart + 0.1, nextEnd);
        } else {
          [nextStart, nextEnd] = clampYDomain(nextStart, nextEnd);
        }
        setYDomain([nextStart, nextEnd]);
        return;
      }
    }
    if (isPanning && panStart != null && panDomain) {
      const chartX = resolveChartX(state);
      const span = panDomain[1] - panDomain[0];
      if (chartX != null && panStartX != null && panWidthRef.current) {
        const deltaPx = chartX - panStartX;
        const deltaYears = -(deltaPx / panWidthRef.current) * span;
        const nextStart = panDomain[0] + deltaYears;
        const nextEnd = panDomain[1] + deltaYears;
        setXDomain(clampXDomain(nextStart, nextEnd));
        return;
      }
      if (year != null) {
        const delta = year - panStart;
        const nextStart = panDomain[0] + delta;
        const nextEnd = panDomain[1] + delta;
        setXDomain(clampXDomain(nextStart, nextEnd));
      }
      return;
    }
    if (dragStart == null) return;
    if (year == null) return;
    setDragEnd(year);
  };

  const handleDragEnd = () => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      setPanDomain(null);
      setPanStartX(null);
      setPanStartY(null);
      setPanDomainY(null);
      setAxisPanMode(null);
      panWidthRef.current = null;
      panHeightRef.current = null;
      return;
    }
    if (dragStart != null && dragEnd != null && dragStart !== dragEnd) {
      const [start, end] = dragStart < dragEnd ? [dragStart, dragEnd] : [dragEnd, dragStart];
      setXDomain([start, end]);
    }
    setDragStart(null);
    setDragEnd(null);
  };

  const palette = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#14b8a6", "#6366f1"];

  const topicColor = (topic: string) => {
    if (topicColors[topic]) return topicColors[topic];
    const idx = selectedTopics.indexOf(topic);
    return palette[idx % palette.length];
  };

  const cycleTopicColor = (topic: string) => {
    setTopicColors((prev) => {
      const current = prev[topic] ?? topicColor(topic);
      const currentIdx = Math.max(0, palette.indexOf(current));
      const next = palette[(currentIdx + 1) % palette.length];
      return { ...prev, [topic]: next };
    });
  };

  useEffect(() => {
    if (initializedSelection.current) return;
    if (insights.length) {
      initializedSelection.current = true;
      setSelectedTopics(insights.slice(0, 5).map((row) => row.topic));
    }
  }, [insights]);

  useEffect(() => {
    setVisibleRows(25);
  }, [searchQuery, sortKey, sortDir, rangeA.from, rangeA.to, rangeB.from, rangeB.to]);

  const handleExportCsv = () => {
    const headers = compareMode
      ? [
          "Mode",
          "Period A",
          "Period B",
          "Topic",
          "Pubs A",
          "Pubs B",
          "Cites A",
          "Cites B",
          "Pubs change",
          "Cites change",
          "Insight",
        ]
      : ["Mode", "Period", "Topic", "Pubs", "Cites"];
    const lines = insights.map((row) => {
      const cells = compareMode
        ? [
            "Compare",
            `${rangeA.from ?? ""}-${rangeA.to ?? ""}`,
            `${rangeB.from ?? ""}-${rangeB.to ?? ""}`,
            row.topic.replace(/"/g, '""'),
            row.pubsA,
            row.pubsB,
            row.citesA,
            row.citesB,
            formatPct(row.pubsDeltaPct),
            formatPct(row.citesDeltaPct),
            row.insight.replace(/"/g, '""'),
          ]
        : [
            "Single",
            `${rangeA.from ?? ""}-${rangeA.to ?? ""}`,
            row.topic.replace(/"/g, '""'),
            row.pubsA,
            row.citesA,
          ];
      return cells.map((cell) => `"${cell}"`).join(",");
    });
    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "insights.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast({ title: "Exported CSV", description: "Downloaded insights.csv" });
  };

  const buildTopicLink = (topic: string, range: Range) => {
    const search = new URLSearchParams();
    if (range.from != null) search.set("fromYear", String(range.from));
    if (range.to != null) search.set("toYear", String(range.to));
    search.set("topic", topic);
    return `/publications?${search.toString()}`;
  };

  const handlePrint = () => {
    window.print();
  };

  const handleShareLinkedIn = () => {
    const url = window.location.href;
    const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied", description: "Insights link copied to clipboard." });
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  const handleExportSvgOrPng = (format: "svg" | "png") => {
    const table = document.getElementById("insights-table");
    if (!table) return;
    const clone = table.cloneNode(true) as HTMLElement;
    clone.style.fontFamily = "Inter, system-ui, -apple-system, sans-serif";
    clone.style.fontSize = "12px";
    clone.style.width = "100%";
    const html = `
      <div style="font-family: Inter, system-ui, -apple-system, sans-serif; font-size: 12px; padding: 12px; color: #111827;">
        <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 8px;">
          <div><strong>Year range:</strong> ${compareMode ? `${rangeA.from ?? ""}-${rangeA.to ?? ""} vs ${rangeB.from ?? ""}-${rangeB.to ?? ""}` : `${rangeA.from ?? ""}-${rangeA.to ?? ""}`}</div>
          <div><strong>Visible series:</strong> Topics${showInstitutions ? ", Institutions" : ""}${showPublications ? ", Publications" : ""}${showCitations ? ", Citations" : ""}</div>
        </div>
        ${clone.outerHTML}
      </div>
    `;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600">
      <foreignObject x="0" y="0" width="1200" height="1600">
        ${html.replace(/&/g, "&amp;")}
      </foreignObject>
    </svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const timestamp = Date.now();
    if (format === "svg") {
      const link = document.createElement("a");
      link.href = url;
      link.download = `insights-${timestamp}.svg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1600;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = `insights-${timestamp}.png`;
        link.click();
        setTimeout(() => {
          URL.revokeObjectURL(pngUrl);
          URL.revokeObjectURL(url);
        }, 1000);
      });
    };
    img.src = url;
  };

  const handleExportChart = (format: "svg" | "png") => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const rect = svg.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const chartInner = source.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    const background = getComputedStyle(document.body).backgroundColor || "#ffffff";
    const combinedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="${background}" />
      ${chartInner}
    </svg>`;

    const blob = new Blob([combinedSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const timestamp = Date.now();

    if (format === "svg") {
      const link = document.createElement("a");
      link.href = url;
      link.download = `insights-chart-${timestamp}.svg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = `insights-chart-${timestamp}.png`;
        link.click();
        setTimeout(() => {
          URL.revokeObjectURL(pngUrl);
          URL.revokeObjectURL(url);
        }, 1000);
      }, "image/png");
    };
    img.src = url;
  };

  const handleRangeChange = (
    which: "A" | "B",
    field: "from" | "to",
    value: number,
  ) => {
    if (which === "A") {
      setRangeA((prev) => ({ ...prev, [field]: value }));
      if (compareMode && field === "to" && rangeB.from != null && value >= rangeB.from) {
        setRangeB((prev) => ({ ...prev, from: value + 1 }));
      }
    } else {
      setRangeB((prev) => ({ ...prev, [field]: value }));
      if (compareMode && field === "from" && rangeA.to != null && value <= rangeA.to) {
        setRangeA((prev) => ({ ...prev, to: value - 1 }));
      }
    }
  };

  const applyRollingPreset = (span: number) => {
    if (!allYears.length) return;
    const min = allYears[0];
    const max = allYears[allYears.length - 1];
    const total = max - min + 1;
    if (total < span * 2) {
      const mid = Math.floor((min + max) / 2);
      setRangeA({ from: min, to: mid });
      setRangeB({ from: mid + 1, to: max });
      setCompareMode(true);
      return;
    }
    const aFrom = max - span * 2 + 1;
    const aTo = max - span;
    const bFrom = max - span + 1;
    const bTo = max;
    setRangeA({ from: aFrom, to: aTo });
    setRangeB({ from: bFrom, to: bTo });
    setCompareMode(true);
  };

  return (
    <SiteShell>
      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Button>
          <Button variant="ghost" onClick={() => navigate(-1)} className="px-2 text-xs">
            Back to previous
          </Button>
        </div>

        <Card className="border-border/60">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileTextIcon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base sm:text-lg text-foreground">Topic insights</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handlePrint}
                  title="Save PDF"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleExportCsv}
                  title="Export CSV"
                >
                  <FileText className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleShareLinkedIn}
                  title="Share on LinkedIn"
                >
                  <Linkedin className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleCopyLink}
                  title="Copy link"
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex w-full max-w-lg items-center">
                <div className="relative w-full">
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search topic or insight..."
                    className="h-9 pl-8 pr-3 text-sm"
                  />
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">View</span>
                  <Button
                    type="button"
                    variant={compareMode ? "secondary" : "outline"}
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => setCompareMode(true)}
                  >
                    Compare A vs B
                  </Button>
                  <Button
                    type="button"
                    variant={!compareMode ? "secondary" : "outline"}
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => setCompareMode(false)}
                  >
                    Single period
                  </Button>
                </div>
                {compareMode && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">Quick presets</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => applyRollingPreset(5)}
                    >
                      Last 5y vs prior 5y
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => applyRollingPreset(3)}
                    >
                      Last 3y vs prior 3y
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setShowChart((prev) => !prev)}
                >
                  {showChart ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      Hide chart
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Show chart
                    </>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {selectedTopics.length
                    ? `${selectedTopics.length} topic${selectedTopics.length > 1 ? "s" : ""} selected`
                    : "Click a topic to plot it"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 justify-end">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{compareMode ? "Period A" : "Period"}</span>
                  {compareMode ? (
                    <>
                      <label className="font-semibold text-foreground">From</label>
                      <select
                        className="h-8 rounded border border-border bg-background px-2 text-xs"
                        value={rangeA.from ?? ""}
                        onChange={(e) => handleRangeChange("A", "from", Number(e.target.value))}
                      >
                        {allYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                      <label className="font-semibold text-foreground">to</label>
                      <select
                        className="h-8 rounded border border-border bg-background px-2 text-xs"
                        value={rangeA.to ?? ""}
                        onChange={(e) => handleRangeChange("A", "to", Number(e.target.value))}
                      >
                        {allYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <label className="font-semibold text-foreground">From</label>
                      <select
                        className="h-8 rounded border border-border bg-background px-2 text-xs"
                        value={rangeA.from ?? ""}
                        onChange={(e) => handleRangeChange("A", "from", Number(e.target.value))}
                      >
                        {allYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                      <label className="font-semibold text-foreground">to</label>
                      <select
                        className="h-8 rounded border border-border bg-background px-2 text-xs"
                        value={rangeA.to ?? ""}
                        onChange={(e) => handleRangeChange("A", "to", Number(e.target.value))}
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
                {compareMode && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">Period B</span>
                    <label className="font-semibold text-foreground">From</label>
                    <select
                      className="h-8 rounded border border-border bg-background px-2 text-xs"
                      value={rangeB.from ?? ""}
                      onChange={(e) => handleRangeChange("B", "from", Number(e.target.value))}
                    >
                      {allYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <label className="font-semibold text-foreground">to</label>
                    <select
                      className="h-8 rounded border border-border bg-background px-2 text-xs"
                      value={rangeB.to ?? ""}
                      onChange={(e) => handleRangeChange("B", "to", Number(e.target.value))}
                    >
                      {allYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {showChart && (
              <Card className="border-border/60 mb-4">
                <CardContent className="flex h-[380px] sm:h-[320px] flex-col space-y-3 overflow-hidden pb-4 pt-4">
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant={showPubsSeries ? "secondary" : "outline"}
                        size="sm"
                        className="h-7 text-[11px] flex items-center gap-2"
                        onClick={() => setShowPubsSeries((prev) => !prev)}
                        title="Publications (solid)"
                        aria-label="Publications (solid)"
                      >
                        <BookOpen className="h-3 w-3" />
                        <span className="inline-block h-0.5 w-4 rounded bg-current" />
                      </Button>
                      <Button
                        type="button"
                        variant={showCitesSeries ? "secondary" : "outline"}
                        size="sm"
                        className="h-7 text-[11px] flex items-center gap-2"
                        onClick={() => setShowCitesSeries((prev) => !prev)}
                        title="Citations (dashed)"
                        aria-label="Citations (dashed)"
                      >
                        <BarChart3 className="h-3 w-3" />
                        <span className="inline-block h-0 w-5 border-t-2 border-dashed border-current" />
                      </Button>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant={chartScale === "linear" ? "secondary" : "outline"}
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => setChartScale("linear")}
                        >
                          Linear
                        </Button>
                        <Button
                          type="button"
                          variant={chartScale === "log" ? "secondary" : "outline"}
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => setChartScale("log")}
                        >
                          Log
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={resetAxes}
                        title="Reset zoom on both axes"
                      >
                        Reset axes
                      </Button>
                    </div>
                    <div className="ml-auto relative flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowChartExportMenu((prev) => !prev)}
                        className="inline-flex items-center justify-center rounded px-2 py-1 text-muted-foreground hover:bg-muted/60"
                        title="Export chart"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {showChartExportMenu ? (
                        <div className="absolute right-0 top-8 z-10 min-w-[110px] rounded-md border border-border bg-popover p-1 shadow-lg">
                          <button
                            type="button"
                            className="w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              handleExportChart("svg");
                              setShowChartExportMenu(false);
                            }}
                          >
                            Export SVG
                          </button>
                          <button
                            type="button"
                            className="w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              handleExportChart("png");
                              setShowChartExportMenu(false);
                            }}
                          >
                            Export PNG
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    {selectedTopics.map((topic) => (
                      <span key={topic} className="flex items-center gap-2 text-foreground">
                        <button
                          type="button"
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: topicColor(topic) }}
                          onClick={() => cycleTopicColor(topic)}
                          title="Change line color"
                        />
                        <span className="hidden sm:inline">{topic}</span>
                      </span>
                    ))}
                  </div>
                  {selectedTopics.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Select topics to plot.
                    </div>
                  ) : (
                    <div
                      ref={chartRef}
                      className="w-full flex-1 min-h-0 overscroll-contain"
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={chartData}
                          margin={{ left: 6, right: 16, top: 0, bottom: 6 }}
                          onMouseDown={handleDragStart}
                          onMouseMove={handleDragMove}
                          onMouseUp={handleDragEnd}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis
                            dataKey="year"
                            type="number"
                            tickMargin={6}
                            domain={xAxisDomain}
                            ticks={xTicks}
                            interval="preserveStartEnd"
                            padding={{ left: 6, right: 6 }}
                            allowDecimals={false}
                            allowDataOverflow
                            stroke="#1f2937"
                            axisLine={{ stroke: "#1f2937", strokeWidth: 1.2 }}
                            tickLine={{ stroke: "#1f2937" }}
                            tick={{
                              fill: "#1f2937",
                              fontSize: 12,
                            }}
                          />
                          <YAxis
                            type="number"
                            scale={chartScale === "log" ? "log" : "linear"}
                            domain={yAxisDomain}
                            allowDecimals={false}
                            allowDataOverflow
                            stroke="#1f2937"
                            axisLine={{ stroke: "#1f2937", strokeWidth: 1.2 }}
                            tickLine={{ stroke: "#1f2937" }}
                            width={30}
                            tickMargin={4}
                            tick={{
                              fill: "#1f2937",
                              fontSize: 12,
                            }}
                          />
                          {dragStart != null && dragEnd != null && dragStart !== dragEnd && (
                            <ReferenceArea
                              x1={dragStart}
                              x2={dragEnd}
                              strokeOpacity={0.1}
                              fill="#0ea5e9"
                              fillOpacity={0.1}
                            />
                          )}
                          {showPubsSeries &&
                            selectedTopics.map((topic) => (
                              <Line
                                key={`${topic}-pubs`}
                                type="monotone"
                                dataKey={`${topic}-pubs`}
                                name={`${topic} pubs`}
                                stroke={topicColor(topic)}
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                              />
                            ))}
                          {showCitesSeries &&
                            selectedTopics.map((topic) => (
                              <Line
                                key={`${topic}-cites`}
                                type="monotone"
                                dataKey={`${topic}-cites`}
                                name={`${topic} cites`}
                                stroke={topicColor(topic)}
                                strokeWidth={2}
                                strokeDasharray="4 2"
                                dot={false}
                                isAnimationActive={false}
                              />
                            ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setShowLegend((prev) => !prev)}
                >
                  {showLegend ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      Hide legend
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Show legend
                    </>
                  )}
                </Button>
              </div>
              {showLegend && (
                <div className="mt-3">
                  {compareMode ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="font-semibold text-foreground">Legend</div>
                        <div className="grid gap-1 sm:grid-cols-2">
                          <span className="inline-flex items-center gap-2">
                            <BookOpen className="h-3 w-3 text-primary" />
                            Pubs A = Period A publications
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <BookOpen className="h-3 w-3 text-primary" />
                            Pubs B = Period B publications
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <BookOpen className="h-3 w-3 text-primary" />
                            Pubs Delta% = % change from Period A to B
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <BarChart3 className="h-3 w-3 text-primary" />
                            Cites A = Period A citations
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <BarChart3 className="h-3 w-3 text-primary" />
                            Cites B = Period B citations
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <BarChart3 className="h-3 w-3 text-primary" />
                            Cites Delta% = % change from Period A to B
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-semibold text-foreground">Badges:</span>
                          <span className="inline-flex items-center gap-1">
                            <span className={`inline-flex items-center justify-center rounded-full p-1 ${badgeTone("Stable")}`}>
                              <BookOpen className="h-3 w-3" />
                            </span>
                            Publications trend
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <span className={`inline-flex items-center justify-center rounded-full p-1 ${badgeTone("Stable")}`}>
                              <BarChart3 className="h-3 w-3" />
                            </span>
                            Citations trend
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1 text-foreground">
                        <div className="font-semibold">Insights</div>
                        <ul className="list-disc pl-4 space-y-0.5">
                          <li>Emerging: only in Period B</li>
                          <li>Declining: missing in Period B or both drop &gt;20%</li>
                          <li>Strong surge: publications &gt;=2x and citations &gt;=2x</li>
                          <li>Growing priority: publications &gt;=1.5x and citations &gt;=1.2x</li>
                          <li>Impact-led: citations &gt;=1.5x with publications flat/declining</li>
                          <li>Output rising, impact softening: publications &gt;=1.2x but citations &lt;0.9x</li>
                          <li>Stable: otherwise</li>
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="font-semibold text-foreground">Legend</div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        <span className="inline-flex items-center gap-2">
                          <BookOpen className="h-3 w-3 text-primary" />
                          Pubs = publications in selected period
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <BarChart3 className="h-3 w-3 text-primary" />
                          Cites = citations in selected period
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="overflow-auto rounded-md border border-border/60" id="insights-table">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-foreground">Topic</th>
                    <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                      <button
                        type="button"
                        className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                        onClick={() => {
                          setSortKey("pubsA");
                          setSortDir((prev) => (sortKey === "pubsA" && prev === "desc" ? "asc" : "desc"));
                        }}
                      >
                        {compareMode ? "Pubs A" : "Pubs"}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    {compareMode && (
                      <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                        <button
                          type="button"
                          className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                          onClick={() => {
                            setSortKey("pubsB");
                            setSortDir((prev) => (sortKey === "pubsB" && prev === "desc" ? "asc" : "desc"));
                          }}
                        >
                          Pubs B
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                    )}
                    {compareMode && (
                      <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                        <button
                          type="button"
                          className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                          onClick={() => {
                            setSortKey("pubsDelta");
                            setSortDir((prev) => (sortKey === "pubsDelta" && prev === "desc" ? "asc" : "desc"));
                          }}
                        >
                          Pubs Delta%
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                    )}
                    <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                      <button
                        type="button"
                        className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                        onClick={() => {
                          setSortKey("citesA");
                          setSortDir((prev) => (sortKey === "citesA" && prev === "desc" ? "asc" : "desc"));
                        }}
                      >
                        {compareMode ? "Cites A" : "Cites"}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                    {compareMode && (
                      <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                        <button
                          type="button"
                          className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                          onClick={() => {
                            setSortKey("citesB");
                            setSortDir((prev) => (sortKey === "citesB" && prev === "desc" ? "asc" : "desc"));
                          }}
                        >
                          Cites B
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                    )}
                    {compareMode && (
                      <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                        <button
                          type="button"
                          className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                          onClick={() => {
                            setSortKey("citesDelta");
                            setSortDir((prev) => (sortKey === "citesDelta" && prev === "desc" ? "asc" : "desc"));
                          }}
                        >
                          Cites Delta%
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                    )}
                    {compareMode && (
                      <th className="px-3 py-2 font-semibold text-foreground">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                            onClick={() => {
                              setSortKey("insight");
                              setSortDir((prev) => (sortKey === "insight" && prev === "desc" ? "asc" : "desc"));
                            }}
                          >
                            Insights
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </div>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {insights.slice(0, visibleRows).map((row) => {
                    const pubsStatus = classifyMetricChange(row.pubsDeltaPct);
                    const citesStatus = classifyMetricChange(row.citesDeltaPct);
                    const selected = selectedTopics.includes(row.topic);
                    return (
                      <tr key={row.topic} className="border-t border-border/60">
                        <td className="px-3 py-2 font-semibold text-foreground">
                          <div className="flex items-center gap-2">
                            {showChart && (
                              <button
                                type="button"
                                onClick={() => toggleTopicSelection(row.topic)}
                                className={`h-6 w-6 rounded border px-1 text-xs font-semibold transition ${
                                  selected
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-background text-muted-foreground"
                                }`}
                                title={selected ? "Remove from chart" : "Add to chart"}
                              >
                                {selected ? "x" : "+"}
                              </button>
                            )}
                            <Tag className="h-3.5 w-3.5 text-primary" />
                            <span className={selected ? "text-primary" : ""}>{row.topic}</span>
                          </div>
                        </td>
                        {compareMode ? (
                          <>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <Link
                            to={buildTopicLink(row.topic, rangeA)}
                            className="text-primary hover:underline"
                          >
                            {row.pubsA}
                          </Link>
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <Link
                            to={buildTopicLink(row.topic, rangeB)}
                            className="text-primary hover:underline"
                          >
                            {row.pubsB}
                          </Link>
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <span className={deltaClass(row.pubsDeltaPct)}>{formatPct(row.pubsDeltaPct)}</span>
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <Link
                            to={buildTopicLink(row.topic, rangeA)}
                            className="text-primary hover:underline"
                          >
                            {row.citesA.toLocaleString()}
                          </Link>
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <Link
                            to={buildTopicLink(row.topic, rangeB)}
                            className="text-primary hover:underline"
                          >
                            {row.citesB.toLocaleString()}
                          </Link>
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <span className={deltaClass(row.citesDeltaPct)}>{formatPct(row.citesDeltaPct)}</span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeTone(pubsStatus)}`}
                              title={`Publications: ${pubsStatus}`}
                            >
                                  <BookOpen className="h-3 w-3" />
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeTone(citesStatus)}`}
                                  title={`Citations: ${citesStatus}`}
                                >
                                  <BarChart3 className="h-3 w-3" />
                                </span>
                            <span className="text-xs text-muted-foreground">{row.insight}</span>
                          </div>
                        </td>
                          </>
                        ) : (
                          <>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <Link
                            to={buildTopicLink(row.topic, rangeA)}
                            className="text-primary hover:underline"
                          >
                            {row.pubsA}
                              </Link>
                            </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <Link
                            to={buildTopicLink(row.topic, rangeA)}
                            className="text-primary hover:underline"
                          >
                            {row.citesA.toLocaleString()}
                              </Link>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  Showing {Math.min(visibleRows, insights.length)} of {insights.length}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleRows((prev) => Math.min(insights.length, prev + 25))}
                    disabled={visibleRows >= insights.length}
                  >
                    Load more
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleRows(insights.length)}
                    disabled={visibleRows >= insights.length}
                  >
                    Load all
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </SiteShell>
  );
};

export default InsightsPage;
