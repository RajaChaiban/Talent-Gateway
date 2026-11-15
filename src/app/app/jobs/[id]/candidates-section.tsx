"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { z } from "zod";
import type {
  NotAtsReadyResume,
  QueuedResume,
  RankedCandidate,
  ResumeCounts,
} from "@/lib/jobs/types";
import type { StoredScore } from "@/lib/score";
import { cn } from "@/lib/utils";
import { NotReadyList } from "./not-ready-list";
import { QueuedList } from "./queued-list";
import { RankedList } from "./ranked-list";

const TAB_IDS = ["ranked", "not-ready"] as const;
type TabId = (typeof TAB_IDS)[number];

const tabSchema = z.enum(TAB_IDS).catch("ranked");

type Props = {
  candidates: RankedCandidate[];
  notAtsReady: NotAtsReadyResume[];
  queued: QueuedResume[];
  counts: ResumeCounts;
  topTalent: StoredScore;
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

export function CandidatesSection({
  candidates,
  notAtsReady,
  queued,
  counts,
  topTalent,
}: Props) {
  const search = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => tabSchema.parse(search.get("tab")));
  const [openId, setOpenId] = useState<string | null>(() => search.get("candidate"));
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ ranked: null, "not-ready": null });

  const shownOpenId = candidates.some((candidate) => candidate.id === openId) ? openId : null;

  useEffect(() => {
    if (openId && shownOpenId === null) writeSearch((params) => params.delete("candidate"));
  }, [openId, shownOpenId]);

  if (counts.resumes === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border surface-subtle px-6 py-12 text-center">
        <Users className="mb-2 size-6 text-muted-foreground" aria-hidden />
        <h3 className="text-heading-16">No resumes yet</h3>
        <p className="max-w-sm text-copy-14 text-muted-foreground">
          Ranked candidates will appear here once resumes are uploaded and analyzed.
        </p>
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

  function toggle(id: string) {
    const next = shownOpenId === id ? null : id;
    setOpenId(next);
    writeSearch((params) => {
      if (next) params.set("candidate", next);
      else params.delete("candidate");
    });
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
  ];

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Candidates" className="flex gap-1 border-b border-border">
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
                "focus-ring -mb-px inline-flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-label-14 font-medium transition-colors",
                selected
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span className="font-mono tabular-nums">({count})</span>
            </button>
          );
        })}
      </div>

      {counts.unchecked > 0 || counts.awaiting_scoring > 0 ? (
        <div className="flex flex-col gap-1 text-copy-14 text-muted-foreground">
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
        className="flex flex-col gap-4"
      >
        <QueuedList resumes={queued} />
        {candidates.length > 0 ? (
          <RankedList
            candidates={candidates}
            topTalent={topTalent}
            openId={shownOpenId}
            onToggle={toggle}
          />
        ) : (
          <p className="text-copy-14 text-muted-foreground">No scored candidates yet.</p>
        )}
      </div>
      <div
        role="tabpanel"
        id="panel-not-ready"
        aria-labelledby="tab-not-ready"
        hidden={tab !== "not-ready"}
        className="flex flex-col gap-4"
      >
        <NotReadyList resumes={notAtsReady} />
      </div>
    </div>
  );
}
