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
const description = `Paste a job description and drop in resumes: ${APP_NAME} screens candidates, catches unreadable files upfront, and ranks top talent with objective match scores.`;

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
    "Instant Pre-Screening",
    "Every incoming resume is automatically inspected for text readability, key sections, an email address, a phone number, and pictures. Scanned images, corrupted files, missing contact details and photos are flagged upfront.",
  ],
  [
    "Intelligent Candidate Scoring",
    "Qualified applicants are evaluated against your job description to produce an objective match score, highlighting relevant experience, top strengths, and skill gaps.",
  ],
  [
    "Radar Risk Detection",
    "Identify red flags before scheduling interviews—including high job-hopping frequency, unexplained employment gaps, and AI-generated resume padding.",
  ],
] as const;

const differences = [
  [
    "Automated pre-filtering upfront",
    "Incomplete or unreadable files are separated into an inspection tab so recruiters never waste time reading corrupt documents or scanned images.",
  ],
  [
    "Custom thresholds per role",
    `Set your own top-talent threshold and invite bar with two simple sliders. Start at ${formatScore(JOB_THRESHOLD_DEFAULTS.topTalent)} and ${formatScore(JOB_THRESHOLD_DEFAULTS.invite)} and adjust criteria to match the seniority of each opening.`,
  ],
  [
    "Transparent, explainable criteria",
    "Every evaluation comes with a concise summary of why the candidate was ranked high or low, giving hiring managers clear evidence for interview decisions.",
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
          <span className="text-heading-16 font-semibold">{APP_NAME}</span>
        </div>
      </header>

      <main className="flex-1 divide-y divide-border">
        {/* Hero Section */}
        <section
          aria-labelledby="hero-title"
          data-section="hero"
          className={cn(band, "grid gap-10 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-12")}
        >
          <div>
            <h1 id="hero-title" className="text-heading-32">
              Screen every resume. Rank your best candidates.
            </h1>
            <p className="mt-4 mb-6 max-w-xl text-copy-16 text-muted-foreground">
              Drop in a batch of resumes against your job description. {APP_NAME} filters out unreadable files, scores candidate experience, and surfaces your top talent in seconds.
            </p>
            <SignIn primary />
          </div>
          <ProductPreview />
        </section>

        {/* How It Works */}
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

        {/* About Section */}
        <section id="about" aria-labelledby="about-heading" className={band}>
          <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
            <div>
              <h2 id="about-heading" className={h2}>
                Built for high-volume hiring
              </h2>
              <p className={cn(body, "mt-2 max-w-sm")}>
                Engineered to help talent teams triage hundreds of applications in minutes without dropping qualified candidates.
              </p>
            </div>
            <div className="space-y-4 text-copy-14 text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">{APP_NAME}</strong> is an intelligent resume screening platform designed to streamline initial applicant review for recruiting teams and hiring managers.
              </p>
              <p>
                Instead of forcing recruiters to spend hours skimming through hundreds of unstructured PDFs, {APP_NAME} automates the initial screening workflow. First, an automated check verifies document readability, section completeness, and contact details.
              </p>
              <p>
                Qualified resumes are then analyzed against the specific requirements of the open role to produce calibrated match scores, summaries, and risk alerts. The result is a clean, ranked shortlist that helps hiring teams schedule the right interviews faster.
              </p>
            </div>
          </div>
        </section>

        {/* What Makes It Different */}
        <section aria-labelledby="different" className={cn(band, "grid gap-8 lg:grid-cols-[1fr_2fr]")}>
          <div>
            <h2 id="different" className={h2}>
              What makes it different
            </h2>
            <p className={cn(body, "mt-2 max-w-sm")}>
              The parts of recruiting that should be fast, consistent and explainable are built that way.
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
                Every passing applicant receives an objective match score out of 10, accompanied by key candidate strengths and identified skill gaps.
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

        {/* Get Started Section */}
        <section
          aria-labelledby="get-started"
          className={cn(band, "flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between")}
        >
          <div>
            <h2 id="get-started" className={h2}>
              Try it with a real job.
            </h2>
            <p className={cn(body, "mt-2")}>
              Sign in with your demo login, create a job and drop in a batch of resumes.
            </p>
          </div>
          <SignIn />
        </section>
      </main>

      <footer className="border-t border-border">
        <div className={cn(column, "flex flex-col gap-1 py-8 text-label-14 sm:flex-row sm:justify-between")}>
          <span className="font-medium text-foreground">{APP_NAME}</span>
          <span className="text-muted-foreground">{APP_DESCRIPTION}</span>
        </div>
      </footer>
    </div>
  );
}
