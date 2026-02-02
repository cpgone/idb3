import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileText, ArrowUpDown, Download, Linkedin, Link as LinkIcon, User, Network, BarChart3, ArrowLeft, Award, Tags, Tag, Building2, ChevronDown, ChevronUp, BookOpen, Mail, Fingerprint, Search, Globe, Copy, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import type { OpenAlexAuthor } from "@/services/openAlex";
import { authors } from "@/data/authors.generated";
import { authorIdentifiers } from "@/data/authorIdentifiers.generated";
import { worksTable } from "@/data/worksTable.generated";
import { SiteShell } from "@/components/SiteShell";
import { toast } from "@/components/ui/use-toast";
import { dedupeWorks } from "@/lib/utils";
import { filterWorks } from "@/lib/blacklist";
import { repairUtf8 } from "@/lib/textRepair";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import Plot from "react-plotly.js";
import Plotly from "plotly.js-dist-min";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import insightsConfig from "../../data/config/insightsconfig.json";
import venueTypeOverridesCsv from "../../data/config/venue-type-overrides.csv?raw";

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

const normalizeOpenAlexId = (raw?: string | null) => {
  if (!raw) return "";
  return raw.replace(/^https?:\/\/(www\.)?openalex\.org\//i, "").trim();
};

const buildAuthorDataUrl = (openAlexId: string) => {
  const baseUrl = typeof import.meta.env.BASE_URL === "string" ? import.meta.env.BASE_URL : "/";
  return `${baseUrl.replace(/\/$/, "/")}author-data/${openAlexId}.json`;
};

const thresholdsConfig =
  (insightsConfig as { insightThresholds?: any })?.insightThresholds || {
    strongSurge: { pubs: 2, cites: 2 },
    growingPriority: { pubs: 1.5, cites: 1.2 },
    impactLed: { cites: 1.5, pubsMax: 1 },
    outputSoftening: { pubs: 1.2, citesMax: 0.9 },
    declineDrop: 0.8,
  };

const defaultYearRangeConfig =
  (insightsConfig as {
    defaultYearRangePages?: { from?: number | null; to?: number | null };
    defaultYearRange?: { from?: number | null; to?: number | null };
  })?.defaultYearRangePages ||
  (insightsConfig as { defaultYearRange?: { from?: number | null; to?: number | null } })
    ?.defaultYearRange ||
  {};

const authorTopTopicsCount =
  (insightsConfig as { authorTopTopicsCount?: number })?.authorTopTopicsCount ?? 4;

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

const buildAggregates = (
  from: number | null,
  to: number | null,
  works: (typeof worksTable)[number][],
) => {
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

export default function AuthorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState<string>("");
  const [openAlexDetails, setOpenAlexDetails] = useState<OpenAlexAuthor | null>(null);
  const PAGE_SIZE = 15;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  type PublicationSortField = "title" | "firstAuthor" | "year" | "topics" | "institutions" | "venue" | "citations";
  const [sortBy, setSortBy] = useState<PublicationSortField>("year");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [workSearch, setWorkSearch] = useState("");
  const [venueTypeFilter, setVenueTypeFilter] = useState<
    "all" | "journal" | "conference" | "other"
  >("all");
  const INSIGHTS_PAGE_SIZE = 8;
  const [visibleInsightCount, setVisibleInsightCount] = useState(INSIGHTS_PAGE_SIZE);
  const [insightsRangeA, setInsightsRangeA] = useState<Range>({ from: null, to: null });
  const [insightsRangeB, setInsightsRangeB] = useState<Range>({ from: null, to: null });
  const [showInsightsPubs, setShowInsightsPubs] = useState(true);
  const [showInsightsCites, setShowInsightsCites] = useState(false);
  const [authorInsightsScale, setAuthorInsightsScale] = useState<"linear" | "log">("linear");
  const [compareInsights, setCompareInsights] = useState(true);
  const [showInsightsChart, setShowInsightsChart] = useState(true);
  const [showInsightsLegend, setShowInsightsLegend] = useState(true);
  const [showAuthorInsightsPopout, setShowAuthorInsightsPopout] = useState(false);
  const [insightSearch, setInsightSearch] = useState("");
  const [selectedInsightTopics, setSelectedInsightTopics] = useState<string[]>([]);
  const insightSelectionInitialized = useRef(false);
  const [insightsSortKey, setInsightsSortKey] = useState<
    "topic" | "pubsA" | "pubsB" | "pubsDelta" | "citesA" | "citesB" | "citesDelta" | "insight"
  >("pubsB");
  const [insightsSortDir, setInsightsSortDir] = useState<"asc" | "desc">("desc");

  const renderWorkTitleHtml = (title: string | undefined) => (
    <span dangerouslySetInnerHTML={{ __html: title || "" }} />
  );

  const localAuthor = useMemo(() => {
    return authors.find(
      (a) =>
        a.authorId === id ||
        a.openAlexId === id ||
        (Array.isArray(a.openAlexIds) && a.openAlexIds.includes(id ?? "")),
    );
  }, [id]);

  useEffect(() => {
    if (id && localAuthor?.authorId && id !== localAuthor.authorId) {
      navigate(`/author/${localAuthor.authorId}`, { replace: true });
    }
  }, [id, localAuthor, navigate]);

  const resolvedOpenAlexId = useMemo(() => {
    if (localAuthor) {
      const primary = normalizeOpenAlexId(localAuthor.openAlexId);
      if (primary) return primary;
      const alt = (localAuthor.openAlexIds || [])
        .map((raw) => normalizeOpenAlexId(raw))
        .find(Boolean);
      if (alt) return alt;
    }
    return normalizeOpenAlexId(id);
  }, [id, localAuthor]);

  const name = displayName || localAuthor?.name || "Author details";
  const alternativeDisplayNames = useMemo(() => {
    const alternatives = openAlexDetails?.display_name_alternatives || [];
    const normalizedBase = name.trim().toLowerCase();
    const seen = new Set<string>();
    const results: string[] = [];
    for (const raw of alternatives) {
      const label = (raw || "").trim();
      if (!label) continue;
      const normalized = label.toLowerCase();
      if (normalized === normalizedBase) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      results.push(label);
    }
    return results;
  }, [name, openAlexDetails?.display_name_alternatives]);

  const scopusId = localAuthor ? authorIdentifiers[localAuthor.authorId]?.scopusId : undefined;

  const identifierItems = useMemo(() => {
    const items: { label: string; value: ReactNode; icon: ReactNode; copyValue: string }[] = [];
    if (localAuthor?.email) {
      items.push({
        label: "Email",
        icon: <Mail className="h-4 w-4 text-primary" />,
        value: (
          <a href={`mailto:${localAuthor.email}`} className="text-primary underline">
            {localAuthor.email}
          </a>
        ),
        copyValue: localAuthor.email,
      });
    }
    if (localAuthor?.orcid) {
      const normalized = localAuthor.orcid.replace(/^https?:\/\//, "").replace(/orcid\.org\//, "");
      items.push({
        label: "ORCID",
        icon: <Fingerprint className="h-4 w-4 text-primary" />,
        value: (
          <a
            href={`https://orcid.org/${normalized}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            {normalized}
          </a>
        ),
        copyValue: normalized,
      });
    }
    if (scopusId) {
      items.push({
        label: "Scopus ID",
        icon: <Search className="h-4 w-4 text-primary" />,
        value: (
          <a
            href={`https://www.scopus.com/authid/detail.uri?authorId=${encodeURIComponent(scopusId)}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            {scopusId}
          </a>
        ),
        copyValue: scopusId,
      });
    }
    if (resolvedOpenAlexId) {
      items.push({
        label: "OpenAlex ID",
        icon: <Globe className="h-4 w-4 text-primary" />,
        value: (
          <a
            href={`https://openalex.org/${resolvedOpenAlexId}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            {resolvedOpenAlexId}
          </a>
        ),
        copyValue: resolvedOpenAlexId,
      });
    }
    return items;
  }, [localAuthor?.email, localAuthor?.orcid, resolvedOpenAlexId, scopusId]);

  const handleCopyIdentifier = useCallback(
    (text: string, label: string) => {
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      toast({
        title: `${label} copied`,
        description: `Copied ${label.toLowerCase()} to clipboard.`,
      });
    },
    [],
  );

  useEffect(() => {
    if (!resolvedOpenAlexId) {
      setOpenAlexDetails(null);
      return;
    }

    let isActive = true;
    const url = buildAuthorDataUrl(resolvedOpenAlexId);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load author cache");
        return res.json();
      })
      .then((data) => {
        if (!isActive) return;
        setOpenAlexDetails(data.details ?? null);
      })
      .catch(() => {
        if (!isActive) return;
        setOpenAlexDetails(null);
      });

    return () => {
      isActive = false;
    };
  }, [resolvedOpenAlexId]);

  const cleanWorksTable = useMemo(() => {
    return filterWorks(worksTable, localAuthor?.authorId);
  }, [localAuthor]);

  const authorWorks = useMemo(() => {
    const targetOpenAlexId = localAuthor?.openAlexId || id;
    if (!targetOpenAlexId) {
      return [] as (typeof worksTable)[number][];
    }

    return cleanWorksTable.filter((w) =>
      (w.allAuthorOpenAlexIds || []).includes(targetOpenAlexId),
    );
  }, [id, localAuthor, cleanWorksTable]);

  const uniqueAuthorWorks = useMemo(
    () => dedupeWorks(authorWorks),
    [authorWorks],
  );


  const yearlyStats = useMemo(() => {
    const byYear = new Map<
      number,
      {
        year: number;
        publications: number;
        citations: number;
      }
    >();

    for (const work of uniqueAuthorWorks) {
      const year = work.year;
      if (!year) continue;
      const existing = byYear.get(year) ?? { year, publications: 0, citations: 0 };
      existing.publications += 1;
      existing.citations += work.citations ?? 0;
      byYear.set(year, existing);
    }

    return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
  }, [uniqueAuthorWorks]);

  const allYears = useMemo(() => yearlyStats.map((s) => s.year), [yearlyStats]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>(allYears);
    if (typeof defaultYearRangeConfig.from === "number") set.add(defaultYearRangeConfig.from);
    if (typeof defaultYearRangeConfig.to === "number") set.add(defaultYearRangeConfig.to);
    return Array.from(set).sort((a, b) => a - b);
  }, [allYears, defaultYearRangeConfig.from, defaultYearRangeConfig.to]);

  const [startYear, setStartYear] = useState<number | null>(null);
  const [endYear, setEndYear] = useState<number | null>(null);

  useEffect(() => {
    if (!yearOptions.length) return;
    const fallbackStart = defaultYearRangeConfig.from ?? yearOptions[0];
    const fallbackEnd = defaultYearRangeConfig.to ?? yearOptions[yearOptions.length - 1];
    setStartYear((prev) => (prev == null ? fallbackStart : prev));
    setEndYear((prev) => (prev == null ? fallbackEnd : prev));
  }, [yearOptions, defaultYearRangeConfig.from, defaultYearRangeConfig.to]);

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

    const resolvedAFrom = defaultA.from ?? min;
    const resolvedATo = defaultA.to;
    const resolvedBFrom = defaultB.from;
    const resolvedBTo = defaultB.to ?? max;

    setInsightsRangeA(normalizeRange(resolvedAFrom, resolvedATo));
    setInsightsRangeB(normalizeRange(resolvedBFrom, resolvedBTo));
  }, [allYears]);

  useEffect(() => {
    if (compareInsights) return;
    if (insightsSortKey === "topic" || insightsSortKey === "pubsA" || insightsSortKey === "citesA") return;
    setInsightsSortKey("pubsA");
  }, [compareInsights, insightsSortKey]);

  useEffect(() => {
    if (compareInsights || !allYears.length) return;
    const min = allYears[0];
    const max = allYears[allYears.length - 1];
    setInsightsRangeA({ from: min, to: max });
  }, [compareInsights, allYears]);


  useEffect(() => {
    setVisibleInsightCount(INSIGHTS_PAGE_SIZE);
  }, [insightsRangeA.from, insightsRangeA.to, insightsRangeB.from, insightsRangeB.to, id, compareInsights, insightSearch]);


  const filteredYearlyStats = useMemo(() => {
    if (!allYears.length) return yearlyStats;
    const from = startYear ?? allYears[0];
    const to = endYear ?? allYears[allYears.length - 1];
    return yearlyStats.filter((s) => s.year >= from && s.year <= to);
  }, [yearlyStats, allYears, startYear, endYear]);

  const rangeFilteredWorks = useMemo(() => {
    if (!uniqueAuthorWorks.length) return [];
    if (!allYears.length) return uniqueAuthorWorks;
    const from = startYear ?? allYears[0];
    const to = endYear ?? allYears[allYears.length - 1];
    return uniqueAuthorWorks.filter((w) => {
      const year = w.year ?? 0;
      return year >= from && year <= to;
    });
  }, [uniqueAuthorWorks, allYears, startYear, endYear]);

  const topTopicsInRange = useMemo(() => {
    const counts = new Map<string, number>();
    rangeFilteredWorks.forEach((work) => {
      (work.topics || []).forEach((topic) => {
        if (!topic) return;
        counts.set(topic, (counts.get(topic) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(0, authorTopTopicsCount))
      .map(([topic, count]) => ({ topic, count }));
  }, [rangeFilteredWorks, authorTopTopicsCount]);

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
    const lines = (venueTypeOverridesCsv || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return map;
    const startIndex = lines[0].toLowerCase().startsWith("venue,") ? 1 : 0;
    for (let i = startIndex; i < lines.length; i += 1) {
      const [venueRaw, typeRaw] = lines[i].split(",").map((v) => v.trim());
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

  const baseFilteredWorks = useMemo(() => {
    const query = workSearch.trim().toLowerCase();
    if (!query) return rangeFilteredWorks;
    const tokens = query.split(/\s+/).filter(Boolean);
    if (!tokens.length) return rangeFilteredWorks;

    return rangeFilteredWorks.filter((work) => {
      const plainTitle = (work.title || "").replace(/<[^>]+>/g, " ");
      const haystack = [
        plainTitle,
        (work.allAuthors || []).join(" "),
        work.venue || "",
        work.publicationDate || "",
        work.year != null ? String(work.year) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [rangeFilteredWorks, workSearch]);

  const filteredWorks = useMemo(() => {
    if (venueTypeFilter === "all") return baseFilteredWorks;
    return baseFilteredWorks.filter((w) => classifyVenueType(w.venue) === venueTypeFilter);
  }, [baseFilteredWorks, venueTypeFilter, venueOverrides]);

  const venueTypeCounts = useMemo(() => {
    const total = baseFilteredWorks.length;
    let journals = 0;
    let conferences = 0;
    let others = 0;
    baseFilteredWorks.forEach((w) => {
      const type = classifyVenueType(w.venue);
      if (type === "journal") journals += 1;
      else if (type === "conference") conferences += 1;
      else others += 1;
    });
    return { all: total, journal: journals, conference: conferences, other: others };
  }, [baseFilteredWorks, venueOverrides]);

  const applyInsightsPreset = (span: number) => {
    if (!allYears.length) return;
    const min = allYears[0];
    const max = allYears[allYears.length - 1];
    const total = max - min + 1;
    if (total < span * 2) {
      const mid = Math.floor((min + max) / 2);
      setInsightsRangeA({ from: min, to: mid });
      setInsightsRangeB({ from: mid + 1, to: max });
      setCompareInsights(true);
      return;
    }
    const aFrom = max - span * 2 + 1;
    const aTo = max - span;
    const bFrom = max - span + 1;
    const bTo = max;
    setInsightsRangeA({ from: aFrom, to: aTo });
    setInsightsRangeB({ from: bFrom, to: bTo });
    setCompareInsights(true);
  };

  const authorInsights = useMemo<TopicInsight[]>(() => {
    if (!allYears.length) return [];
    const aggA = buildAggregates(insightsRangeA.from, insightsRangeA.to, uniqueAuthorWorks);
    const aggB = compareInsights
      ? buildAggregates(insightsRangeB.from, insightsRangeB.to, uniqueAuthorWorks)
      : new Map();
    const topics = new Set<string>(compareInsights ? [...aggA.keys(), ...aggB.keys()] : [...aggA.keys()]);
    const rows: TopicInsight[] = [];
    topics.forEach((topic) => {
      const a = aggA.get(topic) || { pubs: 0, cites: 0 };
      const b = aggB.get(topic) || { pubs: 0, cites: 0 };
      const pubsDeltaPct = compareInsights
        ? a.pubs === 0
          ? b.pubs > 0
            ? Infinity
            : 0
          : b.pubs === 0
            ? -Infinity
            : (b.pubs - a.pubs) / a.pubs
        : null;
      const citesDeltaPct = compareInsights
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
      row.insight = compareInsights ? deriveInsight(row) : "";
      rows.push(row);
    });
    const dir = insightsSortDir === "asc" ? 1 : -1;
    const compare = (x: number | null, y: number | null) => {
      const xv = x ?? -Infinity;
      const yv = y ?? -Infinity;
      if (xv === Infinity && yv !== Infinity) return 1;
      if (yv === Infinity && xv !== Infinity) return -1;
      return (xv - yv) * dir;
    };
    const resolvedSortKey = compareInsights
      ? insightsSortKey
      : insightsSortKey === "topic" || insightsSortKey === "pubsA" || insightsSortKey === "citesA"
        ? insightsSortKey
        : "pubsA";
    const sorted = [...rows].sort((a, b) => {
      if (resolvedSortKey === "topic") return a.topic.localeCompare(b.topic) * dir;
      if (resolvedSortKey === "insight") return a.insight.localeCompare(b.insight) * dir;
      if (resolvedSortKey === "pubsA") return compare(a.pubsA, b.pubsA);
      if (resolvedSortKey === "pubsB") return compare(a.pubsB, b.pubsB);
      if (resolvedSortKey === "pubsDelta") return compare(a.pubsDeltaPct, b.pubsDeltaPct);
      if (resolvedSortKey === "citesA") return compare(a.citesA, b.citesA);
      if (resolvedSortKey === "citesB") return compare(a.citesB, b.citesB);
      if (resolvedSortKey === "citesDelta") return compare(a.citesDeltaPct, b.citesDeltaPct);
      return 0;
    });
    return sorted;
  }, [
    allYears.length,
    insightsSortDir,
    insightsSortKey,
    insightsRangeA.from,
    insightsRangeA.to,
    insightsRangeB.from,
    insightsRangeB.to,
    uniqueAuthorWorks,
    compareInsights,
  ]);

  const filteredAuthorInsights = useMemo(() => {
    const query = insightSearch.trim().toLowerCase();
    if (!query) return authorInsights;
    const tokens = query.split(/\s+/).filter(Boolean);
    if (!tokens.length) return authorInsights;
    return authorInsights.filter((row) => {
      const haystack = `${row.topic} ${row.insight}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [authorInsights, insightSearch]);

  useEffect(() => {
    if (!authorInsights.length) {
      setSelectedInsightTopics([]);
      insightSelectionInitialized.current = false;
      return;
    }

    if (!insightSelectionInitialized.current || selectedInsightTopics.length === 0) {
      setSelectedInsightTopics(authorInsights.slice(0, 5).map((row) => row.topic));
      insightSelectionInitialized.current = true;
    }
  }, [authorInsights, selectedInsightTopics.length]);

  const insightChartYearRange = useMemo(() => {
    if (!allYears.length) return { from: null as number | null, to: null as number | null };
    const minYear = allYears[0];
    const maxYear = allYears[allYears.length - 1];
    const start = compareInsights
      ? Math.min(insightsRangeA.from ?? minYear, insightsRangeB.from ?? minYear)
      : (insightsRangeA.from ?? minYear);
    const end = compareInsights
      ? Math.max(insightsRangeA.to ?? maxYear, insightsRangeB.to ?? maxYear)
      : (insightsRangeA.to ?? maxYear);
    return { from: start, to: end };
  }, [allYears, insightsRangeA.from, insightsRangeA.to, insightsRangeB.from, insightsRangeB.to, compareInsights]);

  const insightChartData = useMemo(() => {
    if (!selectedInsightTopics.length || insightChartYearRange.from == null || insightChartYearRange.to == null) {
      return [];
    }
    const years: number[] = [];
    for (let y = insightChartYearRange.from; y <= insightChartYearRange.to; y += 1) years.push(y);
    const byTopicYear = new Map<
      string,
      {
        pubs: Map<number, number>;
        cites: Map<number, number>;
      }
    >();
    selectedInsightTopics.forEach((topic) => {
      byTopicYear.set(topic, { pubs: new Map(), cites: new Map() });
    });
    uniqueAuthorWorks.forEach((work) => {
      if (typeof work.year !== "number") return;
      if (work.year < insightChartYearRange.from || work.year > insightChartYearRange.to) return;
      (work.topics || []).forEach((topic) => {
        if (!topic || !byTopicYear.has(topic)) return;
        const entry = byTopicYear.get(topic)!;
        entry.pubs.set(work.year, (entry.pubs.get(work.year) || 0) + 1);
        entry.cites.set(work.year, (entry.cites.get(work.year) || 0) + (work.citations || 0));
      });
    });
    return years.map((year) => {
      const row: Record<string, number | string> = { year };
      selectedInsightTopics.forEach((topic) => {
        const entry = byTopicYear.get(topic);
        row[`${topic}-pubs`] = entry?.pubs.get(year) ?? 0;
        row[`${topic}-cites`] = entry?.cites.get(year) ?? 0;
      });
      return row;
    });
  }, [selectedInsightTopics, insightChartYearRange.from, insightChartYearRange.to, uniqueAuthorWorks]);

  const [authorInsightTopicColors, setAuthorInsightTopicColors] = useState<Record<string, string>>({});
  const authorInsightPalette = ["#0ea5e9", "#f97316", "#16a34a", "#7c3aed", "#dc2626", "#14b8a6"];

  const getAuthorInsightColor = useCallback(
    (topic: string) => {
      const existing = authorInsightTopicColors[topic];
      if (existing) return existing;
      const index = Math.max(0, selectedInsightTopics.indexOf(topic));
      return authorInsightPalette[index % authorInsightPalette.length];
    },
    [authorInsightTopicColors, selectedInsightTopics],
  );

  const cycleAuthorInsightColor = useCallback(
    (topic: string) => {
      setAuthorInsightTopicColors((prev) => {
        const current = prev[topic] ?? getAuthorInsightColor(topic);
        const currentIdx = Math.max(0, authorInsightPalette.indexOf(current));
        const next = authorInsightPalette[(currentIdx + 1) % authorInsightPalette.length];
        return { ...prev, [topic]: next };
      });
    },
    [getAuthorInsightColor],
  );

  useEffect(() => {
    if (!selectedInsightTopics.length) return;
    setAuthorInsightTopicColors((prev) => {
      const next = { ...prev };
      selectedInsightTopics.forEach((topic, index) => {
        if (!next[topic]) {
          next[topic] = authorInsightPalette[index % authorInsightPalette.length];
        }
      });
      return next;
    });
  }, [selectedInsightTopics]);

  const authorInsightPlotTraces = useMemo(() => {
    if (!insightChartData.length || !selectedInsightTopics.length) return [];
    const years = insightChartData.map((row) => row.year as number);
    return selectedInsightTopics.flatMap((topic) => {
      const pubs = insightChartData.map((row) => row[`${topic}-pubs`] as number);
      const cites = insightChartData.map((row) => row[`${topic}-cites`] as number);
      const color = getAuthorInsightColor(topic);
      const traces: Array<Record<string, unknown>> = [];
      if (showInsightsPubs) {
        traces.push({
          x: years,
          y: pubs,
          type: "scatter",
          mode: "lines",
          name: `${topic} pubs`,
          line: { color, width: 2 },
        });
      }
      if (showInsightsCites) {
        traces.push({
          x: years,
          y: cites,
          type: "scatter",
          mode: "lines",
          name: `${topic} cites`,
          line: { color, width: 2, dash: "dash" },
        });
      }
      return traces;
    });
  }, [insightChartData, selectedInsightTopics, showInsightsPubs, showInsightsCites, getAuthorInsightColor]);

  const authorInsightPlotLayout = useMemo(
    () => ({
      margin: { l: 50, r: 20, t: 10, b: 40 },
      xaxis: {
        title: "Year",
        type: "linear",
        tickmode: "linear",
        dtick: 1,
        tickformat: "d",
      },
      yaxis: {
        title: "Count",
        type: authorInsightsScale,
        rangemode: "tozero",
      },
      dragmode: "pan",
      hovermode: "x unified",
      legend: { orientation: "h", y: 1.15, x: 0 },
      uirevision: "author-insights",
    }),
    [authorInsightsScale],
  );

  const authorInsightPlotConfig = useMemo(
    () => ({
      displaylogo: false,
      displayModeBar: true,
      responsive: true,
      scrollZoom: true,
    }),
    [],
  );

  const toggleInsightTopicSelection = (topic: string) => {
    setSelectedInsightTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  };

  const summary = useMemo(() => {
    if (!id) {
      return {
        totalPublications: 0,
        totalCitations: 0,
        hIndex: 0,
        topics: 0,
        institutions: 0,
      };
    }

    const citationsList: number[] = [];
    let totalPublications = 0;
    const topicSet = new Set<string>();
    const institutionSet = new Set<string>();

    for (const w of uniqueAuthorWorks) {
      if (!w.year) continue;

      totalPublications += 1;
      citationsList.push(w.citations ?? 0);

      for (const t of w.topics || []) {
        if (t) topicSet.add(t);
      }
      for (const inst of w.institutions || []) {
        if (inst) institutionSet.add(inst);
      }
    }

    const totalCitations = citationsList.reduce((sum, c) => sum + c, 0);

    let hIndex = 0;
    const allCitations = uniqueAuthorWorks.map((w) => w.citations ?? 0);
    const sorted = allCitations.sort((a, b) => b - a);
    for (let i = 0; i < sorted.length; i += 1) {
      if (sorted[i] >= i + 1) {
        hIndex = i + 1;
      } else {
        break;
      }
    }

    return {
      totalPublications,
      totalCitations,
      hIndex,
      topics: topicSet.size,
      institutions: institutionSet.size,
    };
  }, [id, uniqueAuthorWorks]);



  const buildAuthorPublicationsPath = () => {
    const search = new URLSearchParams();
    const authorName = localAuthor?.name;
    if (authorName) search.set("author", authorName);
    if (resolvedOpenAlexId) search.set("authorId", resolvedOpenAlexId);
    if (startYear != null) search.set("fromYear", String(startYear));
    if (endYear != null) search.set("toYear", String(endYear));
    return `/publications?${search.toString()}`;
  };

  const buildAuthorCitationsPath = () => {
    const search = new URLSearchParams();
    const authorName = localAuthor?.name;
    if (authorName) search.set("author", authorName);
    if (resolvedOpenAlexId) search.set("authorId", resolvedOpenAlexId);
    if (startYear != null) search.set("fromYear", String(startYear));
    if (endYear != null) search.set("toYear", String(endYear));
    return `/citations?${search.toString()}`;
  };

  const buildAuthorTopicsPath = () => {
    const search = new URLSearchParams();
    const authorName = localAuthor?.name;
    if (authorName) search.set("author", authorName);
    if (resolvedOpenAlexId) search.set("authorId", resolvedOpenAlexId);
    if (startYear != null) search.set("fromYear", String(startYear));
    if (endYear != null) search.set("toYear", String(endYear));
    return `/topics?${search.toString()}`;
  };

  const buildAuthorTopicPublicationsPath = (topicName: string) => {
    const search = new URLSearchParams();
    const authorName = localAuthor?.name;
    if (authorName) search.set("author", authorName);
    if (resolvedOpenAlexId) search.set("authorId", resolvedOpenAlexId);
    if (startYear != null) search.set("fromYear", String(startYear));
    if (endYear != null) search.set("toYear", String(endYear));
    search.set("topic", topicName);
    return `/publications?${search.toString()}`;
  };

  const buildInsightPublicationsPath = (topicName: string, range: Range) => {
    const search = new URLSearchParams();
    const authorName = localAuthor?.name;
    if (authorName) search.set("author", authorName);
    if (resolvedOpenAlexId) search.set("authorId", resolvedOpenAlexId);
    if (range.from != null) search.set("fromYear", String(range.from));
    if (range.to != null) search.set("toYear", String(range.to));
    search.set("topic", topicName);
    return `/publications?${search.toString()}`;
  };

  const buildInsightCitationsPath = (topicName: string, range: Range) => {
    const search = new URLSearchParams();
    const authorName = localAuthor?.name;
    if (authorName) search.set("author", authorName);
    if (resolvedOpenAlexId) search.set("authorId", resolvedOpenAlexId);
    if (range.from != null) search.set("fromYear", String(range.from));
    if (range.to != null) search.set("toYear", String(range.to));
    search.set("topic", topicName);
    return `/citations?${search.toString()}`;
  };

  const buildAuthorInstitutionsPath = () => {
    const search = new URLSearchParams();
    const authorName = localAuthor?.name;
    if (authorName) search.set("author", authorName);
    if (resolvedOpenAlexId) search.set("authorId", resolvedOpenAlexId);
    if (startYear != null) search.set("fromYear", String(startYear));
    if (endYear != null) search.set("toYear", String(endYear));
    return `/institutions?${search.toString()}`;
  };


  const getPublicationSortValue = useCallback(
    (field: PublicationSortField, w: (typeof filteredWorks)[number]) => {
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
    },
    [],
  );

  const sortedWorks = useMemo(() => {
    const items = [...filteredWorks];
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
  }, [filteredWorks, sortBy, sortOrder, getPublicationSortValue]);

  const visibleWorks = sortedWorks.slice(0, visibleCount || sortedWorks.length);
  const hasMoreToShow = visibleCount < filteredWorks.length;

  const toggleSort = (field: PublicationSortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder(field === "year" || field === "citations" ? "desc" : "asc");
    }
  };

  const handleSavePdf = () => {
    window.print();
  };


  const handleExportWorksCsv = () => {
    if (!sortedWorks.length) return;

    const clean = (value: unknown) => repairUtf8(value ?? "");

    const headers = ["title", "year", "venue", "citations", "citation_harvard"];

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

    const exportYear = (work: (typeof worksTable)[number]) => {
      if (work.publicationDate) {
        const d = new Date(work.publicationDate);
        if (!Number.isNaN(d.getTime())) return d.getFullYear();
      }
      return work.year ?? "";
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
      const yearPart = exportYear(w);
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
    for (const w of sortedWorks) {
      lines.push(
        [
          decodeHtmlEntities(clean(w.title || "")),
          exportYear(w),
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
    a.download = `${(localAuthor?.name || name).replace(/\s+/g, "_")}-works.csv`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShareLinkedIn = () => {
    const url = window.location.href;
    const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    const url = window.location.href;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        toast({
          title: "Link copied",
          description: "Author page URL copied to clipboard.",
        });
      }
    } catch {
      // Silent failure is acceptable here
    }
  };

  return (
    <SiteShell>
      <main className="container mx-auto px-4 py-6 space-y-4">
        <Card className="border-border/60">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-fit px-2 text-xs"
                  onClick={() => navigate("/")}
                >
                  <ArrowLeft className="mr-1 h-3 w-3" />
                  Back to dashboard
                </Button>
              </div>
              <CardTitle className="flex items-center gap-2">

                <User className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold text-foreground">{name}</span>
              </CardTitle>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                {identifierItems.length > 0 && (
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    {identifierItems.map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <span>{item.icon}</span>
                        <span className="flex items-baseline gap-1 whitespace-nowrap">
                          <span className="font-semibold text-foreground">{item.label}:</span>
                          <span>{item.value}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyIdentifier(item.copyValue, item.label)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded border border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                          aria-label={`Copy ${item.label}`}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {alternativeDisplayNames.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Tag className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-foreground">OpenAlex alternate names:</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      {alternativeDisplayNames.map((alias) => (
                        <span
                          key={alias}
                          className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-foreground"
                        >
                          {alias}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>

            <div className="flex flex-col items-end gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleSavePdf}
                  title="Save PDF"
                >
                  <Download className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleExportWorksCsv}
                  title="Export CSV"
                >
                  <FileText className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleShareLinkedIn}
                  title="Share on LinkedIn"
                >
                  <Linkedin className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleCopyLink}
                  title="Copy link"
                >
                  <LinkIcon className="h-3 w-3" />
                </Button>
                {id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => navigate(`/author/${id}/network`)}
                    title="View co-author network"
                  >
                    <Network className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <FileText className="h-4 w-4 text-primary" />
                  <Link
                    to={buildAuthorPublicationsPath()}
                    className="font-semibold text-foreground hover:underline"
                  >
                    {summary.totalPublications} publications
                  </Link>
                </div>
                <div className="flex items-center gap-1">
                  <Award className="h-4 w-4 text-primary" />
                  <Link
                    to={buildAuthorCitationsPath()}
                    className="font-semibold text-foreground hover:underline"
                  >
                    {summary.totalCitations} citations
                  </Link>
                </div>
                <div className="flex items-center gap-1">
                  <Tags className="h-4 w-4 text-primary" />
                  <Link
                    to={buildAuthorTopicsPath()}
                    className="font-semibold text-foreground hover:underline"
                  >
                    {summary.topics} topics
                  </Link>
                </div>
                <div className="flex items-center gap-1">
                  <Building2 className="h-4 w-4 text-primary" />
                  <Link
                    to={buildAuthorInstitutionsPath()}
                    className="font-semibold text-foreground hover:underline"
                  >
                    {summary.institutions} institutions
                  </Link>
                </div>
                <div className="flex items-center gap-1">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span>
                    <span className="font-semibold text-foreground">
                      {summary.hIndex}
                    </span>{" "}
                    h-index
                  </span>
                </div>
              </div>
              {topTopicsInRange.length > 0 && (
                <div className="w-full max-w-md text-left">
                  <div className="font-semibold text-foreground">Top topics</div>
                  <ul className="list-disc pl-4 text-xs text-muted-foreground">
                    {topTopicsInRange.map((item) => (
                      <li key={item.topic} className="mt-1">
                        <Link
                          to={buildAuthorTopicPublicationsPath(item.topic)}
                          className="hover:underline"
                        >
                          {item.topic}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={buildAuthorTopicsPath()}
                    className="mt-1 inline-block text-[11px] font-semibold text-primary hover:underline"
                  >
                    See more
                  </Link>
                </div>
              )}
            </div>

          </CardHeader>
        </Card>

        {yearlyStats.length > 0 && (
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <span>Impact over time</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="mb-3 flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
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
                      {yearOptions.map((y) => (
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
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ backgroundColor: "hsl(var(--accent))" }}
                        aria-hidden
                      />
                      <span className="text-foreground">Publications (bars)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full border-2"
                        style={{ borderColor: "hsl(var(--primary))" }}
                        aria-hidden
                      />
                      <span className="text-foreground">Citations (line)</span>
                    </div>
                  </div>
                </div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredYearlyStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="year"
                        stroke="hsl(var(--muted-foreground))"
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 11,
                        }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                        }}
                      />
                      <Bar dataKey="publications" fill="hsl(var(--accent))" name="Publications" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filteredYearlyStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="year"
                        stroke="hsl(var(--muted-foreground))"
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        tick={{
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 11,
                        }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="citations"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name="Citations"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {uniqueAuthorWorks.length > 0 && (
          <Card className="border-border/60">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                 <CardTitle className="flex items-center gap-2">
                   <Tags className="h-5 w-5 text-primary" />
                   <span>Topic insights</span>
                 </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
                <div className="mb-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex w-full max-w-lg items-center">
                      <div className="relative w-full">
                        <Input
                          type="text"
                          value={insightSearch}
                          onChange={(e) => setInsightSearch(e.target.value)}
                          placeholder="Search topic or insight..."
                          className="h-8 pl-8 pr-3 text-xs"
                        />
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">View</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={`h-7 text-[11px] ${compareInsights ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
                          onClick={() => setCompareInsights(true)}
                          aria-pressed={compareInsights}
                        >
                          Compare A vs B
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={`h-7 text-[11px] ${!compareInsights ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:bg-muted/40"}`}
                          onClick={() => setCompareInsights(false)}
                          aria-pressed={!compareInsights}
                        >
                          Single period
                        </Button>
                      </div>
                      {compareInsights && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">Quick presets</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] text-muted-foreground hover:bg-muted/40"
                            onClick={() => applyInsightsPreset(5)}
                          >
                            Last 5y vs prior 5y
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] text-muted-foreground hover:bg-muted/40"
                            onClick={() => applyInsightsPreset(3)}
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
                        onClick={() => setShowInsightsChart((prev) => !prev)}
                      >
                        {showInsightsChart ? (
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
                        {selectedInsightTopics.length
                          ? `${selectedInsightTopics.length} topic${selectedInsightTopics.length > 1 ? "s" : ""} selected`
                          : "Click a topic to plot it"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 justify-end">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{compareInsights ? "Period A" : "Period"}</span>
                        {compareInsights ? (
                          <>
                            <label className="font-semibold text-foreground">From</label>
                            <select
                              className="h-7 rounded border border-border bg-background px-2 text-xs"
                              value={insightsRangeA.from ?? ""}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                setInsightsRangeA((prev) => ({
                                  from: value,
                                  to: prev.to != null && value > prev.to ? value : prev.to,
                                }));
                              }}
                            >
                              {allYears.map((y) => (
                                <option key={`a-from-${y}`} value={y}>
                                  {y}
                                </option>
                              ))}
                            </select>
                            <label className="font-semibold text-foreground">to</label>
                            <select
                              className="h-7 rounded border border-border bg-background px-2 text-xs"
                              value={insightsRangeA.to ?? ""}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                setInsightsRangeA((prev) => ({
                                  from: prev.from != null && value < prev.from ? value : prev.from,
                                  to: value,
                                }));
                              }}
                            >
                              {allYears.map((y) => (
                                <option key={`a-to-${y}`} value={y}>
                                  {y}
                                </option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <>
                            <label className="font-semibold text-foreground">From</label>
                            <select
                              className="h-7 rounded border border-border bg-background px-2 text-xs"
                              value={insightsRangeA.from ?? ""}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                setInsightsRangeA((prev) => ({
                                  from: value,
                                  to: prev.to != null && value > prev.to ? value : prev.to,
                                }));
                              }}
                            >
                              {allYears.map((y) => (
                                <option key={`single-from-${y}`} value={y}>
                                  {y}
                                </option>
                              ))}
                            </select>
                            <label className="font-semibold text-foreground">to</label>
                            <select
                              className="h-7 rounded border border-border bg-background px-2 text-xs"
                              value={insightsRangeA.to ?? ""}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                setInsightsRangeA((prev) => ({
                                  from: prev.from != null && value < prev.from ? value : prev.from,
                                  to: value,
                                }));
                              }}
                            >
                              {allYears.map((y) => (
                                <option key={`single-to-${y}`} value={y}>
                                  {y}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                      {compareInsights && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">Period B</span>
                          <label className="font-semibold text-foreground">From</label>
                          <select
                            className="h-7 rounded border border-border bg-background px-2 text-xs"
                            value={insightsRangeB.from ?? ""}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              setInsightsRangeB((prev) => ({
                                from: value,
                                to: prev.to != null && value > prev.to ? value : prev.to,
                              }));
                            }}
                          >
                            {allYears.map((y) => (
                              <option key={`b-from-${y}`} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                          <label className="font-semibold text-foreground">to</label>
                          <select
                            className="h-7 rounded border border-border bg-background px-2 text-xs"
                            value={insightsRangeB.to ?? ""}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              setInsightsRangeB((prev) => ({
                                from: prev.from != null && value < prev.from ? value : prev.from,
                                to: value,
                              }));
                            }}
                          >
                            {allYears.map((y) => (
                              <option key={`b-to-${y}`} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                  {showInsightsChart && (
                    <>
                      <Card className="border-border/60 mb-4">
                        <CardContent className="flex h-[520px] sm:h-[420px] flex-col space-y-3 overflow-hidden pb-4 pt-4">
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                              className={`h-7 text-[11px] flex items-center gap-2 ${
                                showInsightsPubs ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:bg-muted/40"
                              }`}
                              onClick={() => setShowInsightsPubs((prev) => !prev)}
                              title="Publications (solid)"
                              aria-label="Publications (solid)"
                              aria-pressed={showInsightsPubs}
                            >
                              <BookOpen className="h-3 w-3" />
                              <span className="inline-block h-0.5 w-4 rounded bg-current" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={`h-7 text-[11px] flex items-center gap-2 ${
                                showInsightsCites ? "bg-muted/50 text-foreground" : "text-muted-foreground hover:bg-muted/40"
                              }`}
                              onClick={() => setShowInsightsCites((prev) => !prev)}
                              title="Citations (dashed)"
                              aria-label="Citations (dashed)"
                              aria-pressed={showInsightsCites}
                            >
                              <BarChart3 className="h-3 w-3" />
                              <span className="inline-block h-0 w-5 border-t-2 border-dashed border-current" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant={authorInsightsScale === "linear" ? "secondary" : "outline"}
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => setAuthorInsightsScale("linear")}
                            >
                              Linear
                            </Button>
                            <Button
                              type="button"
                              variant={authorInsightsScale === "log" ? "secondary" : "outline"}
                              size="sm"
                              className="h-7 text-[11px]"
                              onClick={() => setAuthorInsightsScale("log")}
                            >
                              Log
                            </Button>
                          </div>
                          <div className="ml-auto">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-[11px] flex items-center gap-2"
                              onClick={() => setShowAuthorInsightsPopout(true)}
                              title="Pop out chart"
                            >
                              <Maximize2 className="h-3 w-3" />
                              Pop out
                            </Button>
                          </div>
                        </div>
                        {selectedInsightTopics.length === 0 ? (
                          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                            Select topics to plot.
                          </div>
                        ) : (
                          <div className="w-full flex-1 min-h-0">
                            <Plot
                              data={authorInsightPlotTraces}
                              layout={authorInsightPlotLayout}
                              config={authorInsightPlotConfig}
                              useResizeHandler
                              style={{ width: "100%", height: "100%" }}
                              plotly={Plotly}
                              onClick={(event) => {
                                const point = event?.points?.[0];
                                if (!point?.data) return;
                                const name = String(point.data.name || "");
                                const topic = name.replace(/\s+(pubs|cites)\s*$/i, "").trim();
                                if (topic) cycleAuthorInsightColor(topic);
                              }}
                            />
                          </div>
                        )}
                        </CardContent>
                      </Card>
                    </>
                  )}

                  {showAuthorInsightsPopout && (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                      role="dialog"
                      aria-modal="true"
                    >
                      <div
                        className="rounded-lg bg-background shadow-xl border border-border resize overflow-hidden"
                        style={{
                          width: "min(95vw, 1200px)",
                          height: "min(85vh, 720px)",
                          minWidth: "640px",
                          minHeight: "420px",
                          maxWidth: "95vw",
                          maxHeight: "90vh",
                        }}
                      >
                        <div className="flex h-full flex-col">
                          <div className="flex items-center justify-between border-b border-border px-4 py-3">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-primary" />
                              <span className="text-sm font-semibold text-foreground">
                                Topic insights chart
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() => setShowAuthorInsightsPopout(false)}
                              title="Close"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="p-4 flex-1 min-h-0">
                            {selectedInsightTopics.length === 0 ? (
                              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                Select topics to plot.
                              </div>
                            ) : (
                              <div className="h-full w-full">
                                <Plot
                                  data={authorInsightPlotTraces}
                                  layout={authorInsightPlotLayout}
                                  config={authorInsightPlotConfig}
                                  useResizeHandler
                                  style={{ width: "100%", height: "100%" }}
                                  plotly={Plotly}
                                  onClick={(event) => {
                                    const point = event?.points?.[0];
                                    if (!point?.data) return;
                                    const name = String(point.data.name || "");
                                    const topic = name.replace(/\s+(pubs|cites)\s*$/i, "").trim();
                                    if (topic) cycleAuthorInsightColor(topic);
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {compareInsights && (
                    <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] text-muted-foreground">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => setShowInsightsLegend((prev) => !prev)}
                        >
                          {showInsightsLegend ? (
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
                      {showInsightsLegend && (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
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
                          </div>
                          <div className="space-y-1 text-foreground">
                            <div className="font-semibold">Insights</div>
                            <ul className="list-disc pl-4 space-y-0.5">
                              <li>Emerging: only in Period B</li>
                              <li>Declining: missing in Period B or both drop &gt;20%</li>
                              <li>Strong surge: publications &gt;= 2x and citations &gt;= 2x</li>
                              <li>Growing priority: publications &gt;= 1.5x and citations &gt;= 1.2x</li>
                              <li>Impact-led: citations &gt;= 1.5x with publications flat/declining</li>
                              <li>Output rising, impact softening: publications &gt;= 1.2x but citations &lt; 0.9x</li>
                              <li>Stable: otherwise</li>
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="overflow-auto rounded-md border border-border/60">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        <th className="px-3 py-2 font-semibold text-foreground">
                          <button
                            type="button"
                            className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                            onClick={() => {
                              setInsightsSortKey("topic");
                              setInsightsSortDir((prev) =>
                                insightsSortKey === "topic" && prev === "desc" ? "asc" : "desc",
                              );
                            }}
                          >
                            Topic
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        {compareInsights && (
                          <th className="px-3 py-2 font-semibold text-foreground sm:hidden">
                            Insights
                          </th>
                        )}
                        <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                          <button
                            type="button"
                            className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                            onClick={() => {
                              setInsightsSortKey("pubsA");
                              setInsightsSortDir((prev) =>
                                insightsSortKey === "pubsA" && prev === "desc" ? "asc" : "desc",
                              );
                            }}
                          >
                            {compareInsights ? "Pubs A" : "Pubs"}
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        {compareInsights && (
                          <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                            <button
                              type="button"
                              className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                              onClick={() => {
                                setInsightsSortKey("pubsB");
                                setInsightsSortDir((prev) =>
                                  insightsSortKey === "pubsB" && prev === "desc" ? "asc" : "desc",
                                );
                              }}
                            >
                              Pubs B
                              <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                        )}
                        {compareInsights && (
                          <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                            <button
                              type="button"
                              className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                              onClick={() => {
                                setInsightsSortKey("pubsDelta");
                                setInsightsSortDir((prev) =>
                                  insightsSortKey === "pubsDelta" && prev === "desc" ? "asc" : "desc",
                                );
                              }}
                            >
                              Pubs Δ%
                              <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                        )}
                        <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                          <button
                            type="button"
                            className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                            onClick={() => {
                              setInsightsSortKey("citesA");
                              setInsightsSortDir((prev) =>
                                insightsSortKey === "citesA" && prev === "desc" ? "asc" : "desc",
                              );
                            }}
                          >
                            {compareInsights ? "Cites A" : "Cites"}
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </th>
                        {compareInsights && (
                          <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                            <button
                              type="button"
                              className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                              onClick={() => {
                                setInsightsSortKey("citesB");
                                setInsightsSortDir((prev) =>
                                  insightsSortKey === "citesB" && prev === "desc" ? "asc" : "desc",
                                );
                              }}
                            >
                              Cites B
                              <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                        )}
                        {compareInsights && (
                          <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                            <button
                              type="button"
                              className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                              onClick={() => {
                                setInsightsSortKey("citesDelta");
                                setInsightsSortDir((prev) =>
                                  insightsSortKey === "citesDelta" && prev === "desc" ? "asc" : "desc",
                                );
                              }}
                            >
                              Cites Δ%
                              <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                        )}
                        {compareInsights && (
                          <th className="px-3 py-2 font-semibold text-foreground hidden sm:table-cell">
                            <button
                              type="button"
                              className="flex items-center gap-1 bg-transparent p-0 text-xs font-semibold text-foreground hover:underline"
                              onClick={() => {
                                setInsightsSortKey("insight");
                                setInsightsSortDir((prev) =>
                                  insightsSortKey === "insight" && prev === "desc" ? "asc" : "desc",
                                );
                              }}
                            >
                              Insights
                              <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAuthorInsights.slice(0, visibleInsightCount).map((row) => {
                        const pubsStatus = classifyMetricChange(row.pubsDeltaPct);
                        const citesStatus = classifyMetricChange(row.citesDeltaPct);
                        const selected = selectedInsightTopics.includes(row.topic);
                        const insightColor = selected ? getAuthorInsightColor(row.topic) : "";
                        return (
                          <tr key={row.topic} className="border-t border-border/60">
                            <td className="px-3 py-2 font-semibold text-foreground">
                              <div className="flex items-center gap-2">
                                {showInsightsChart && (
                                  <button
                                    type="button"
                                    onClick={() => toggleInsightTopicSelection(row.topic)}
                                    className={`h-6 w-6 rounded border px-1 text-xs font-semibold transition ${
                                      selected
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border bg-background text-muted-foreground"
                                    }`}
                                    title={selected ? "Remove from chart" : "Add to chart"}
                                  >
                                    {selected ? "-" : "+"}
                                  </button>
                                )}
                                <Tag
                                  className="h-3.5 w-3.5"
                                  style={insightColor ? { color: insightColor } : undefined}
                                />
                                <span
                                  className={`min-w-0 break-words sm:break-normal ${selected ? "text-primary" : ""}`}
                                  style={insightColor ? { color: insightColor } : undefined}
                                >
                                  {row.topic}
                                </span>
                              </div>
                            </td>
                            {compareInsights ? (
                              <>
                                <td className="px-3 py-2 hidden sm:table-cell">
                                  <Link
                                    to={buildInsightPublicationsPath(row.topic, insightsRangeA)}
                                    className="text-primary hover:underline"
                                  >
                                    {row.pubsA}
                                  </Link>
                                </td>
                                <td className="px-3 py-2 hidden sm:table-cell">
                                  <Link
                                    to={buildInsightPublicationsPath(row.topic, insightsRangeB)}
                                    className="text-primary hover:underline"
                                  >
                                    {row.pubsB}
                                  </Link>
                                </td>
                                <td className="px-3 py-2 hidden sm:table-cell">
                                  <span className={deltaClass(row.pubsDeltaPct)}>
                                    {formatPct(row.pubsDeltaPct)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 hidden sm:table-cell">
                                  <Link
                                    to={buildInsightCitationsPath(row.topic, insightsRangeA)}
                                    className="text-primary hover:underline"
                                  >
                                    {row.citesA.toLocaleString()}
                                  </Link>
                                </td>
                                <td className="px-3 py-2 hidden sm:table-cell">
                                  <Link
                                    to={buildInsightCitationsPath(row.topic, insightsRangeB)}
                                    className="text-primary hover:underline"
                                  >
                                    {row.citesB.toLocaleString()}
                                  </Link>
                                </td>
                                <td className="px-3 py-2 hidden sm:table-cell">
                                  <span className={deltaClass(row.citesDeltaPct)}>
                                    {formatPct(row.citesDeltaPct)}
                                  </span>
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
                                <td className="px-3 py-2">
                                  <Link
                                    to={buildInsightPublicationsPath(row.topic, insightsRangeA)}
                                    className="text-primary hover:underline"
                                  >
                                    {row.pubsA}
                                  </Link>
                                </td>
                                <td className="px-3 py-2">
                                  <Link
                                    to={buildInsightCitationsPath(row.topic, insightsRangeA)}
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
                      {filteredAuthorInsights.length === 0 && (
                        <tr>
                          <td
                            colSpan={compareInsights ? 8 : 3}
                            className="text-center text-muted-foreground py-6"
                          >
                            No topic insights found for this author.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredAuthorInsights.length > visibleInsightCount && (
                  <div className="flex justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVisibleInsightCount((count) =>
                          Math.min(count + INSIGHTS_PAGE_SIZE, filteredAuthorInsights.length),
                        )
                      }
                    >
                      Load more
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVisibleInsightCount(filteredAuthorInsights.length)}
                    >
                      Load all
                    </Button>
                  </div>
                )}
              </CardContent>
          </Card>
        )}

        <Card className="border-border/60">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span>Publications</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <>
              {allYears.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
                  <Input
                    value={workSearch}
                    onChange={(e) => {
                      setVisibleCount(PAGE_SIZE);
                      setWorkSearch(e.target.value);
                    }}
                    placeholder="Search title, author, venue..."
                    className="h-8 text-xs sm:w-72"
                  />
                  <div className="flex flex-wrap items-center gap-3">
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
                </div>
              )}
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">Venue type</span>
                  {(["all", "journal", "conference", "other"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`rounded-full px-3 py-1 text-[11px] transition ${
                        venueTypeFilter === value
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/40"
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
                    </button>
                  ))}
                </div>
                <span>
                  Showing {visibleWorks.length} of {sortedWorks.length} publications
                </span>
              </div>
              <div className="overflow-x-auto rounded-md border border-border/60 bg-card/40">
                <Table className="min-w-full">
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
                      <TableHead className="hidden md:table-cell text-xs text-muted-foreground">
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
                    {visibleWorks.map((work) => {
                      const rawDoi = (work.doi || "").trim();
                      const cleanedDoi = rawDoi
                        .replace(/^https?:\/\/(www\.)?doi\.org\//i, "")
                        .replace(/^doi:/i, "")
                        .trim();
                      const doiUrl = cleanedDoi ? `https://doi.org/${cleanedDoi}` : "";

                      const allAuthorNames = work.allAuthors || [];
                      const firstAuthor = allAuthorNames[0] ?? "";
                      const otherAuthors = allAuthorNames.slice(1);
                      const firstAuthorLastName =
                        work.firstAuthorLastName ||
                        (firstAuthor
                          ? firstAuthor.split(/\s+/).filter(Boolean).slice(-1)[0]
                          : "");
                      const displayFirstAuthor =
                        firstAuthorLastName && otherAuthors.length > 0
                          ? `${firstAuthorLastName} et al.`
                          : firstAuthorLastName || firstAuthor;

                      const year = work.year ?? "";
                      const publicationDate = work.publicationDate || "";
                      const publicationDateLabel = (() => {
                        if (!publicationDate) return "";
                        const date = new Date(publicationDate);
                        if (!Number.isNaN(date.getTime())) {
                          return date.toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          });
                        }
                        return publicationDate;
                      })();
                      const displayDate = (() => {
                        if (publicationDate) {
                          const date = new Date(publicationDate);
                          if (!Number.isNaN(date.getTime())) {
                            return date.toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            });
                          }
                          return publicationDate;
                        }
                        return year ? String(year) : "";
                      })();
                      const venue = work.venue || "";
                      const citations = work.citations ?? 0;

                      return (
                        <TableRow key={work.workId}>
                          <TableCell className="align-top font-medium text-foreground">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-start gap-2">
                                <FileText className="mt-0.5 h-4 w-4 text-primary" />
                                {doiUrl ? (
                                  <a
                                    href={doiUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary hover:underline"
                                  >
                                    {renderWorkTitleHtml(work.title)}
                                  </a>
                                ) : (
                                  renderWorkTitleHtml(work.title)
                                )}
                              </div>

                              {/* Compact mobile line */}
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground md:hidden">
                                {venue && (
                                  <span className="font-semibold text-foreground">
                                    {venue}
                                  </span>
                                )}

                                {displayFirstAuthor && (
                                  <>
                                    <span>|</span>
                                    <span>{displayFirstAuthor}</span>
                                  </>
                                )}

                                {displayDate && (
                                  <>
                                    <span>|</span>
                                    <span>{displayDate}</span>
                                  </>
                                )}

                                {typeof citations === "number" && citations > 0 && (
                                  <>
                                    <span>|</span>
                                    <span>{citations} citations</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Desktop-only columns */}
                          <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                            {displayFirstAuthor ? (
                              otherAuthors.length > 0 ? (
                                <Tooltip>
                                  <TooltipTrigger className="underline decoration-dotted underline-offset-2">
                                    {displayFirstAuthor}
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-xs">
                                    <p className="font-semibold mb-1">Authors</p>
                                    <p>{[firstAuthor, ...otherAuthors].join(", ")}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                displayFirstAuthor
                              )
                            ) : (
                              ""
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground text-right">
                            {year ? (
                              publicationDateLabel ? (
                                <Tooltip>
                                  <TooltipTrigger className="inline-flex justify-end text-right w-full">
                                    {year}
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Published {publicationDateLabel}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                year
                              )
                            ) : (
                              ""
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {venue}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-right">
                            {citations}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredWorks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          No publications found for this author in the selected range.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {filteredWorks.length > 0 && (
                <div className="flex justify-center gap-2 pt-4">
                  {hasMoreToShow && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVisibleCount((count) =>
                          Math.min(count + PAGE_SIZE, filteredWorks.length),
                        )
                      }
                    >
                      Load more
                    </Button>
                  )}
                  {hasMoreToShow && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVisibleCount(filteredWorks.length)}
                    >
                      Load all
                    </Button>
                  )}
                </div>
              )}
            </>
          </CardContent>

        </Card>
      </main>
    </SiteShell>
  );
}
