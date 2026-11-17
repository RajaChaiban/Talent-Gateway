import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { ProductPreview } from "@/components/landing/product-preview";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/config";
import { siteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

const title = `${APP_NAME} · ${APP_DESCRIPTION}`;
const description = `Paste a job description and drop in resumes: ${APP_NAME} screens candidates, catches unreadable files upfront, and ranks top talent with objective match scores.`;

/** Search and social tags for the landing page. */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: APP_NAME, title, description, locale: "en_US" },
  twitter: { card: "summary", title, description },
};

/** One content column for every band of the page. */
const column = "mx-auto w-full max-w-4xl px-5";
const band = cn(column, "border-t border-border py-14 md:py-16");
const eyebrow = "text-label-12 font-medium tracking-wide text-muted-foreground";
const h2 = "mt-3 text-2xl font-semibold tracking-[-0.04em]";

const steps = [
  ["01", "Create a role", "Add the job description and set the standards that matter to your team."],
  ["02", "Review the shortlist", "Candidates are organized by fit, with clear reasons behind every score."],
  ["03", "Meet your next teammate", "Invite promising candidates and keep your hiring process moving."],
] as const;

const differences = [
  "Clear, configurable criteria, not a mystery score.",
  "Every shortlist comes with the context behind it.",
  "Your team stays in control of who moves forward.",
  "Designed to help humans decide, never decide for them.",
] as const;

/*
 * The /login links do not prefetch: /login runs the auth proxy, and a visit
 * to this static page should cause no server work beyond the file itself.
 */
function SignIn({ cta, label }: { cta: "primary" | "secondary"; label: string }) {
  return (
    <Link
      href="/login"
      prefetch={false}
      data-cta={cta}
      className={buttonVariants({ size: "lg" })}
    >
      {label}
      <ArrowRight data-icon="inline-end" aria-hidden />
    </Link>
  );
}

/** The public landing page at /. */
export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className={cn(column, "flex h-16 items-center justify-between")}>
          <Brand />
          <Link
            href="/login"
            prefetch={false}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section
          aria-labelledby="hero-title"
          data-section="hero"
          className={cn(
            column,
            "grid gap-10 pb-20 pt-16 md:grid-cols-[.92fr_1.08fr] md:items-center md:gap-12 md:pb-28 md:pt-24",
          )}
        >
          <div className="min-w-0">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-label-12 text-muted-foreground">
              <Sparkles className="size-3.5" aria-hidden />
              A clearer way to hire
            </p>
            <h1
              id="hero-title"
              className="max-w-xl text-4xl leading-tight font-semibold tracking-[-0.04em] sm:text-5xl"
            >
              Find the right people, sooner.
            </h1>
            <p className="mt-5 max-w-md text-copy-16 text-muted-foreground">
              Spend less time sorting resumes and more time meeting the people who can move your team forward.
            </p>
            <div className="mt-8">
              <SignIn cta="primary" label="Get started" />
            </div>
          </div>
          <ProductPreview />
        </section>

        <section aria-labelledby="how-it-works" className={band}>
          <p className={eyebrow}>HOW IT WORKS</p>
          <h2 id="how-it-works" className={h2}>
            A thoughtful process, from day one.
          </h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {steps.map(([number, name, text]) => (
              <li key={number}>
                <span className="font-mono text-label-14 text-muted-foreground">{number}</span>
                <h3 className="mt-3 text-heading-16">{name}</h3>
                <p className="mt-2 text-copy-14 text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="about" aria-labelledby="about-heading" className={band}>
          <p className={eyebrow}>ABOUT</p>
          <h2 id="about-heading" className={h2}>
            Hiring is human. The busywork shouldn&apos;t be.
          </h2>
          <p className="mt-4 max-w-2xl text-copy-14 text-muted-foreground">
            {APP_NAME} helps recruiting teams make sense of a crowded inbox without losing sight of the person behind every resume. It gives teams a consistent, explainable starting point so people can spend their time where it counts: in conversation.
          </p>
        </section>

        <section aria-labelledby="different" className={band}>
          <p id="different" className={eyebrow}>
            WHAT IS DIFFERENT
          </p>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2">
            {differences.map((point) => (
              <li key={point} className="flex items-start gap-3 text-copy-14">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="get-started"
          className={cn(column, "my-8")}
        >
          <div className="surface-subtle flex flex-col items-start justify-between gap-5 rounded-xl border border-border p-6 sm:flex-row sm:items-center sm:p-8">
            <div>
              <h2 id="get-started" className="text-xl font-semibold tracking-[-0.02em]">
                Make room for better conversations.
              </h2>
              <p className="mt-2 text-copy-14 text-muted-foreground">
                Start with a role. Find your next great teammate.
              </p>
            </div>
            <SignIn cta="secondary" label="Sign in" />
          </div>
        </section>
      </main>

      <footer className={cn(column, "mt-10 border-t border-border")}>
        <div className="flex flex-col gap-3 py-6 text-label-12 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Brand />
          <span>{APP_DESCRIPTION}</span>
        </div>
      </footer>
    </div>
  );
}
