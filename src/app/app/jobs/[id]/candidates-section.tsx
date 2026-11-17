"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Users } from "lucide-react";
import { z } from "zod";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  NotAtsReadyResume,
  QueuedResume,
  RankedCandidate,
  ResumeCounts,
} from "@/lib/jobs/types";
import type { StoredScore } from "@/lib/score";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { NotReadyList } from "./not-ready-list";
import { QueuedList } from "./queued-list";
import { RankedList } from "./ranked-list";

const TAB_IDS = ["ranked", "not-ready", "queued"] as const;
type TabId = (typeof TAB_IDS)[number];

// An unknown or missing `?tab=` value falls back to the ranked tab instead of failing.
const tabSchema = z.enum(TAB_IDS).catch("ranked");

type Props = {
  candidates: RankedCandidate[];
  notAtsReady: NotAtsReadyResume[];
  queued: QueuedResume[];
  counts: ResumeCounts;
  topTalent: StoredScore;
  jobTitle: string;
};

/** Changes the query string without a navigation: no server round trip, no new history entry. */
function writeSearch(change: (params: URLSearchParams) => void) {
  const params = new URLSearchParams(window.location.search);
  change(params);
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The job page's candidate tabs: Ranked, Not ATS-ready and Queued. The open tab
 * and the open candidate are kept in the URL (`tab`, `candidate`) so a link or
 * reload returns to the same view. The search filters the loaded lists in the
 * browser: ranked candidates by name, set-aside and queued resumes by file name.
 */
export function CandidatesSection({
  candidates,
  notAtsReady,
  queued,
  counts,
  topTalent,
  jobTitle,
}: Props) {
  const search = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => tabSchema.parse(search.get("tab")));
  const [openId, setOpenId] = useState<string | null>(() => search.get("candidate"));
  const [focusInviteId, setFocusInviteId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    ranked: null,
    "not-ready": null,
    queued: null,
  });

  const shownOpenId = candidates.some((candidate) => candidate.id === openId) ? openId : null;

  useEffect(() => {
    if (openId && shownOpenId === null) writeSearch((params) => params.delete("candidate"));
  }, [openId, shownOpenId]);

  const ranks = useMemo(
    () => new Map(candidates.map((candidate, index) => [candidate.id, index + 1])),
    [candidates],
  );

  const needle = query.trim().toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(needle);
  const shownCandidates = needle ? candidates.filter((c) => matches(c.full_name)) : candidates;
  const shownNotReady = needle ? notAtsReady.filter((r) => matches(r.file_name)) : notAtsReady;
  const shownQueued = needle ? queued.filter((r) => matches(r.file_name)) : queued;

  if (counts.resumes === 0) {
    return (
      <div className="flex flex-col">
        <h2 id="candidates-heading" className="border-b border-border pb-3 text-heading-20">
          Candidates
        </h2>
        <EmptyState
          icon={Users}
          title="No resumes yet"
          body="Ranked candidates will appear here once resumes are uploaded and analyzed."
          action={
            <a href="#resumes" className={buttonVariants({ size: "lg" })}>
              Add resumes
            </a>
          }
        />
      </div>
    );
  }

  function selectTab(next: TabId, focus = false) {
    setTab(next);
    writeSearch((params) => {
      params.set("tab", next);
      if (next !== "ranked") params.delete("candidate");
    });
    if (next !== "ranked") setOpenId(null);
    if (focus) tabRefs.current[next]?.focus();
  }

  function showCandidate(next: string | null) {
    setOpenId(next);
    writeSearch((params) => {
      if (next) params.set("candidate", next);
      else params.delete("candidate");
    });
  }

  function toggle(id: string) {
    showCandidate(shownOpenId === id ? null : id);
  }

  /** The row's invite shortcut: open the candidate (if closed) and send focus to the email field. Nothing is sent. */
  function openInvite(id: string) {
    if (shownOpenId !== id) showCandidate(id);
    setFocusInviteId(id);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TAB_IDS.indexOf(tab);
    const target: Record<string, TabId | undefined> = {
      ArrowRight: TAB_IDS[(index + 1) % TAB_IDS.length],
      ArrowLeft: TAB_IDS[(index + TAB_IDS.length - 1) % TAB_IDS.length],
      Home: TAB_IDS[0],
      End: TAB_IDS[TAB_IDS.length - 1],
    };
    const next = target[event.key];
    if (!next) return;
    event.preventDefault();
    selectTab(next, true);
  }

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "ranked", label: "Ranked", count: candidates.length },
    { id: "not-ready", label: "Not ATS-ready", count: notAtsReady.length },
    { id: "queued", label: "Queued", count: queued.length },
  ];

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="candidates-heading" className="text-heading-20">
          Candidates
        </h2>
        <div className="relative sm:w-56">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search candidates by name"
            placeholder="Search candidates"
            autoComplete="off"
            spellCheck={false}
            className="pl-9"
          />
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Candidate groups"
        className="flex gap-5 overflow-x-auto border-b border-border"
      >
        {tabs.map(({ id, label, count }) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              ref={(element) => {
                tabRefs.current[id] = element;
              }}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={selected}
              aria-controls={`panel-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(id)}
              onKeyDown={onTabKeyDown}
              className={cn(
                "focus-ring -mb-px inline-flex shrink-0 items-center gap-2 rounded-t-sm border-b-2 px-1 py-3 text-label-14 font-medium transition-colors",
                selected
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-label-12 text-muted-foreground tabular-nums">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {counts.unchecked > 0 || counts.awaiting_scoring > 0 ? (
        <div className="mt-3 flex flex-col gap-1 text-copy-14 text-muted-foreground">
          {counts.unchecked > 0 ? (
            <p>{plural(counts.unchecked, "resume is", "resumes are")} not yet checked.</p>
          ) : null}
          {counts.awaiting_scoring > 0 ? (
            <p>
              {plural(counts.awaiting_scoring, "ATS-ready resume is", "ATS-ready resumes are")}{" "}
              waiting to be scored.
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        role="tabpanel"
        id="panel-ranked"
        aria-labelledby="tab-ranked"
        hidden={tab !== "ranked"}
        className="mt-3 flex flex-col gap-3"
      >
        {candidates.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No scored candidates yet"
            body="Analyze the resumes to rank the ATS-ready ones here."
          />
        ) : shownCandidates.length === 0 ? (
          <EmptyState icon={Search} title="No candidates found" body="Try a different search." />
        ) : (
          <RankedList
            candidates={shownCandidates}
            ranks={ranks}
            topTalent={topTalent}
            jobTitle={jobTitle}
            openId={shownOpenId}
            onToggle={toggle}
            focusInviteId={focusInviteId}
            onInvite={openInvite}
            onInviteFocused={() => setFocusInviteId(null)}
          />
        )}
      </div>
      <div
        role="tabpanel"
        id="panel-not-ready"
        aria-labelledby="tab-not-ready"
        hidden={tab !== "not-ready"}
        className="mt-3 flex flex-col gap-3"
      >
        <NotReadyList resumes={shownNotReady} totalCount={notAtsReady.length} />
      </div>
      <div
        role="tabpanel"
        id="panel-queued"
        aria-labelledby="tab-queued"
        hidden={tab !== "queued"}
        className="mt-3 flex flex-col gap-3"
      >
        <QueuedList resumes={shownQueued} totalCount={queued.length} />
      </div>
    </div>
  );
}
