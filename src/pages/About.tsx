import { SiteShell } from "@/components/SiteShell";
import {
  Info,
  ListChecks,
  Database,
  Layers,
  AlertTriangle,
  Rocket,
  BookOpen,
  Shield,
} from "lucide-react";

const About = () => {
  return (
    <SiteShell>
      <main className="container mx-auto px-4 py-10 max-w-3xl space-y-8">
        <section className="space-y-4">
          <h1 className="text-3xl font-bold text-foreground mt-2 flex items-center gap-3">
            <Info className="h-7 w-7 text-primary" />
            <span>About the Integrative Dashboard (IDB)</span>
          </h1>
          <p className="text-muted-foreground">
            The Integrative Dashboard (IDB) follows the Web-based Interactive Integrated Platform (WIIP) approach for customizing open-source tools for geoscience data. It provides an offline, data-driven view of research activity across topics, institutions, members, and publications using precomputed tables.
          </p>
          <p className="text-muted-foreground">
            All counts, charts, and tables come from locally cached bibliographic data sourced from OpenAlex (Priem et al., 2022), keeping the experience fast and available even without live API calls.
          </p>
          <h2 className="text-xl font-semibold text-foreground mt-4 mb-2 flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            <span>Use the dashboard to</span>
          </h2>
          <ul className="list-disc pl-6 space-y-1 text-muted-foreground text-sm">
            <li>Trace publication and citation output by topic, institution, and member across years.</li>
            <li>Compare collaboration patterns and explore co-author networks for individual researchers.</li>
            <li>Open publication records (DOI, URL) directly from the tables and detail views.</li>
            <li>Slice precomputed data by year range, topic, institution, or author without waiting on remote queries.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground mt-4 mb-2 flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <span>How the data is built</span>
          </h2>
          <ul className="list-disc pl-6 space-y-1 text-muted-foreground text-sm">
            <li>Author identities live in CSV config at <code>data/config/authors-source.csv</code>.</li>
            <li>Node scripts cache each author&apos;s works from OpenAlex, then generate consolidated CSVs for works, topics, institutions, and member metrics (Priem et al., 2022).</li>
            <li>During the build step, those CSVs become generated TypeScript tables that the app loads at runtime.</li>
            <li>Co-author network views use cached JSON snapshots stored alongside the generated data.</li>
            <li>An RSS feed of recent works is created from the same tables and published at <code>/rss.xml</code>.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground mt-4 mb-2 flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span>Platform context</span>
          </h2>
          <ul className="list-disc pl-6 space-y-1 text-muted-foreground text-sm">
            <li>The dashboard aligns with the WIIP customization approach for integrating heterogeneous geological data into interactive web tools (Alqubalee, 2025).</li>
            <li>IDB serves as the visualization layer for program-level, institutional, and author-centric analytics.</li>
          </ul>
        </section>


        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground mt-4 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            <span>Data limitations</span>
          </h2>
          <ul className="list-disc pl-6 space-y-1 text-muted-foreground text-sm">
            <li>Name spellings may vary between sources, and similar author names can be hard to disambiguate.</li>
            <li>Authors sometimes publish under multiple name variants, which can affect counts.</li>
            <li>Co-author graphs reflect cached OpenAlex snapshots and may not include the most recent updates.</li>
            <li>Topic counts represent unique topics attached to works, not the number of works themselves.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground mt-4 mb-2 flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <span>Future enhancements</span>
          </h2>
          <ul className="list-disc pl-6 space-y-1 text-muted-foreground text-sm">
            <li>Persist derived data in a lightweight offline database to speed up large refreshes.</li>
            <li>Add journal and venue quality signals so results can be filtered or summarized by ranking tier.</li>
            <li>Offer richer analysis views that let users define custom year, topic, institution, and member slices.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground mt-4 mb-2 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span>References</span>
          </h2>
          <ul className="list-disc pl-6 space-y-1 text-muted-foreground text-sm">
            <li>
              Priem, J., Piwowar, H., & Orr, R. (2022). OpenAlex: A fully-open index of scholarly works, authors, venues, institutions, and concepts. ArXiv. <a className="text-primary underline" href="https://arxiv.org/abs/2205.01833" target="_blank" rel="noreferrer">https://arxiv.org/abs/2205.01833</a>
            </li>
            <li>
              Alqubalee, A. (2025, April 8). WIIP: An Approach for Leveraging Geological Data Heterogeneity through Customization of Open-Source Software. ALQUBALEE Notes. <a className="text-primary underline" href="https://qubalee.github.io/posts/2025/04/wiip/" target="_blank" rel="noreferrer">https://qubalee.github.io/posts/2025/04/wiip/</a>
            </li>
          </ul>
        </section>


        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground mt-4 mb-2 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span>Disclaimer</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            The dashboard relies on experimental, locally cached bibliographic data. Counts, classifications, and affiliations may contain errors or omissions. Use it for exploration and internal insight only; it should not be used for formal evaluation, assessment, or decision-making about individual researchers or programs.
          </p>
        </section>
      </main>
    </SiteShell>
  );
};

export default About;
