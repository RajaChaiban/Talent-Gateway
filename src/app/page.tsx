import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ProductPreview } from "@/components/landing/product-preview";
import { APP_DESCRIPTION, APP_NAME, JOB_THRESHOLD_DEFAULTS } from "@/lib/config";
import { formatScore } from "@/lib/score";
import { siteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

const title = `${APP_NAME} · ${APP_DESCRIPTION}`;
const description = `Paste a job description and drop in resumes: ${APP_NAME} checks each one with free rules, scores and ranks the rest against the job.`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: APP_NAME, title, description, locale: "en_US" },
  twitter: { card: "summary", title, description },
};

/** One content column for every band of the page. */
const column = "mx-auto w-full max-w-5xl px-4 sm:px-8";
const band = cn(column, "py-12 sm:py-16");
const h2 = "text-heading-24";
const h3 = "text-heading-16";
const body = "text-copy-14 text-muted-foreground";

const steps = [
  [
    "Screen every resume",
    "Each resume first goes through a rule-based ATS check. The ones that pass are scored by AI against the job, with strengths, gaps and risk flags.",
  ],
  [
    "Rank the candidates",
    "Everyone is sorted by match score. Resumes that fail the check get their own list with the reasons, so nobody is dropped silently.",
  ],
  [
    "Spot risks with Radar",
    "Everyone is evaluated for strengths, skill gaps, and Radar risk flags like job hopping, timeline gaps, and AI-generated text.",
  ],
] as const;

const differences = [
  [
    "A free rule check before any AI",
    "The ATS check runs in code, first. A resume that fails it makes no model call and waits in its own list until you choose to score it anyway.",
  ],
  [
    "Thresholds set per job",
    `Each job has its own top-talent bar and invite bar, set with two sliders. They start at ${formatScore(JOB_THRESHOLD_DEFAULTS.topTalent)} and ${formatScore(JOB_THRESHOLD_DEFAULTS.invite)} and change only that job.`,
  ],
  [
    "Built on Vercel AI Gateway",
    "Model calls route through AI Gateway for unified request tracing, per-job spend visibility, and provider failover without changing application code.",
  ],
] as const;

/*
 * The /login links do not prefetch: /login runs the auth proxy, and a visit
 * to this static page should cause no server work beyond the file itself.
 */
function SignIn({ primary = false }: { primary?: boolean }) {
  return (
    <Link
      href="/login"
      prefetch={false}
      data-cta={primary ? "primary" : "secondary"}
      className={buttonVariants({ variant: primary ? "default" : "outline", size: "lg" })}
    >
      Sign in
      <ArrowRight data-icon="inline-end" aria-hidden />
    </Link>
  );
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className={cn(column, "flex h-16 items-center justify-between")}>
          <span className="text-heading-16">{APP_NAME}</span>
          <Link
            href="/login"
            prefetch={false}
            className="focus-ring rounded-sm text-label-14 text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1 divide-y divide-border">
        <section
          aria-labelledby="hero-title"
          data-section="hero"
          className={cn(band, "grid gap-10 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-12")}
        >
          <div>
            <h1 id="hero-title" className="text-heading-32">
              Screen every resume. Rank the best.
            </h1>
            <p className="mt-4 mb-6 max-w-xl text-copy-16 text-muted-foreground">
              Paste a job description and drop in resumes, and {APP_NAME} checks, scores
              and ranks them against the role.
            </p>
            <SignIn primary />
          </div>
          <ProductPreview />
        </section>

        <section aria-labelledby="how-it-works" className={band}>
          <h2 id="how-it-works" className={h2}>
            How it works
          </h2>
          <ol className="surface-card mt-6 grid divide-y divide-border rounded-lg border border-border md:grid-cols-3 md:divide-x md:divide-y-0">
            {steps.map(([name, text]) => (
              <li key={name} className="space-y-2 p-6">
                <h3 className={h3}>{name}</h3>
                <p className={body}>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="different" className={cn(band, "grid gap-8 lg:grid-cols-[1fr_2fr]")}>
          <div>
            <h2 id="different" className={h2}>
              What makes it different
            </h2>
            <p className={cn(body, "mt-2 max-w-sm")}>
              The parts of screening that should be cheap, consistent and explainable are
              built that way.
            </p>
          </div>
          <ul className="grid gap-8 sm:grid-cols-2">
            {differences.map(([name, text]) => (
              <li key={name} className="space-y-2 border-t border-border pt-4">
                <h3 className={h3}>{name}</h3>
                <p className={body}>{text}</p>
              </li>
            ))}
            <li className="space-y-2 border-t border-border pt-4">
              <h3 className={h3}>Structured scores and summaries</h3>
              <p className={body}>
                Every passing resume receives an AI-generated match summary with clear strengths
                and skill gaps, scored out of 10.
              </p>
              <p className="flex gap-2 pt-1 font-mono text-label-12 text-muted-foreground">
                <span className="rounded-full border border-border-strong px-2.5 py-1">
                  ≥ 8.0 TOP TALENT
                </span>
                <span className="rounded-full border border-border-strong px-2.5 py-1">
                  5.0–7.9 CONSIDER
                </span>
              </p>
            </li>
          </ul>
        </section>

        <section
          aria-labelledby="get-started"
          className={cn(band, "flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between")}
        >
          <div>
            <h2 id="get-started" className={h2}>
              Try it with a real job.
            </h2>
            <p className={cn(body, "mt-2")}>
              Sign in with your demo login, create a job and drop in a few resumes.
            </p>
          </div>
          <SignIn />
        </section>
      </main>

      <footer className="border-t border-border">
        <div className={cn(column, "flex flex-col gap-1 py-8 text-label-14 sm:flex-row sm:justify-between")}>
          <span className="font-medium">{APP_NAME}</span>
          <span className="text-muted-foreground">{APP_DESCRIPTION}</span>
        </div>
      </footer>
    </div>
  );
}
