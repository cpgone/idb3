# Insights Classification Method

This document explains how the dashboard’s topic “insights” are computed, notes the absence of a specific published method behind the current rules, and why this classification is useful.

## What the insights are

Insights are **rule-based labels** assigned to each topic by comparing two time periods:
- **Period A** (earlier window)
- **Period B** (later window)

For each topic, we compute:
- `pubsA`, `citesA`: total publications and citations in Period A
- `pubsB`, `citesB`: total publications and citations in Period B

Growth ratios:
- `pubsGrowth = pubsB / pubsA` (with special handling when `pubsA = 0`)
- `citesGrowth = citesB / citesA` (with special handling when `citesA = 0`)

Edge handling:
- If `pubsA = 0` and `pubsB > 0` → **Emerging in period B**
- If `pubsA > 0` and `pubsB = 0` → **Absent in period B**

## Rule set (current)

Thresholds are configured in `data/config/insightsconfig.json` under `insightThresholds`.

Default values:
```json
"insightThresholds": {
  "strongSurge": { "pubs": 2.0, "cites": 2.0 },
  "growingPriority": { "pubs": 1.5, "cites": 1.2 },
  "impactLed": { "cites": 1.5, "pubsMax": 1.0 },
  "outputSoftening": { "pubs": 1.2, "citesMax": 0.9 },
  "declineDrop": 0.8
}
```

Classification logic (in order):
1. **Emerging in period B**  
   `pubsA = 0` and `pubsB > 0`
2. **Absent in period B**  
   `pubsA > 0` and `pubsB = 0`
3. **Strong surge in output and impact**  
   `pubsGrowth >= strongSurge.pubs` **and** `citesGrowth >= strongSurge.cites`
4. **Growing priority with rising impact**  
   `pubsGrowth >= growingPriority.pubs` **and** `citesGrowth >= growingPriority.cites`
5. **Output rising, impact softening**  
   `pubsGrowth >= outputSoftening.pubs` **and** `citesGrowth < outputSoftening.citesMax`
6. **Declining emphasis**  
   `pubsGrowth < declineDrop` **and** `citesGrowth < declineDrop`
7. **Impact rising faster than output**  
   `citesGrowth >= impactLed.cites` **and** `pubsGrowth <= impactLed.pubsMax`
8. **Stable focus**  
   Anything not captured above

## Where the logic lives

- `src/pages/Insights.tsx`  
  `deriveInsight(...)` and the dashboard totals use the same thresholds from `insightsconfig.json`.
- `src/pages/AuthorDetail.tsx`  
  Uses the same classification approach for author-level topic insights.

## Is there a published method behind this?

No. The current approach is **custom and heuristic**, chosen for interpretability and ease of tuning.  
It does not implement a specific published bibliometric classification standard.

That said, the idea of comparing two time windows to detect topic growth/decline is common in bibliometrics and research trend analysis. If you want alignment with a published framework (e.g., a formal trend‑detection method), we can adapt the rules accordingly.

## Why we use this classification

This classification helps non-technical users quickly answer:
- **What’s emerging?** (new topics in Period B)
- **What’s accelerating?** (strong surges)
- **What’s cooling?** (declines, output rising but impact softening)
- **Where impact is outpacing output** (impact‑led)

It provides a fast, consistent, and configurable way to summarize trends without requiring users to interpret raw tables.

## How to change thresholds

Edit `data/config/insightsconfig.json`:
- Adjust `insightThresholds` values
- Adjust `insightsDefaultPeriodA` / `insightsDefaultPeriodB` for default windowing

After changes, rebuild if your workflow requires it.

## Suggested next steps (optional)

If you want stronger methodological grounding:
- Identify a published trend‑detection method
- Map its definitions to `insightThresholds`
- Document the mapping here for transparency
