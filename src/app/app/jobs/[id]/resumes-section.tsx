"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  Check,
  CircleAlert,
  Clock,
  FilePlus2,
  LoaderCircle,
  RotateCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { LocalDate } from "@/components/jobs/local-date";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { RESUME_LIMITS } from "@/lib/config";
import { resumeCountLabel } from "@/lib/jobs/helpers";
import { deleteResume } from "@/lib/resumes/client-api";
import { validateDrop, type RejectedFile } from "@/lib/resumes/drop";
import { removalVerdict } from "@/lib/resumes/removal";
import { FILE_RULE_MESSAGE } from "@/lib/resumes/messages";
import { SAMPLE_ZIP, samplePath } from "@/lib/samples";
import { hasStoredFile, resumeFileHref, savedResumeStatus } from "@/lib/resumes/saved-status";
import type { ResumeListItem } from "@/lib/resumes/types";
import { createUploadQueue, type QueueItem } from "@/lib/resumes/upload-queue";
import { createUploadWorker, newUploadProgress, type UploadJob } from "@/lib/resumes/upload-pipeline";
import { cn } from "@/lib/utils";
import { FileGlyph } from "./file-glyph";

type Item = QueueItem<UploadJob>;

/** A quiet icon button on a resume row. */
const ICON_ACTION = "text-muted-foreground hover:text-foreground";
/** The row's remove button, which turns to the error colours on hover. */
const REMOVE_ACTION = "text-muted-foreground hover:bg-error-subtle hover:text-error";

const REFRESH_DELAY_MS = 400;

type Tone = "muted" | "success" | "warning" | "error";

const TONE_CLASS: Record<Tone, string> = {
  muted: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
};

function Status({ children, tone = "muted" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-copy-13", TONE_CLASS[tone])}>
      {children}
    </span>
  );
}

function UploadStatus({ item }: { item: Item }) {
  switch (item.stage) {
    case "queued":
      return <Status>Queued</Status>;
    case "running":
      return (
        <Status>
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          {item.detail === "reading" ? "Reading" : "Uploading"}
        </Status>
      );
    case "waiting":
      return (
        <Status tone="warning">
          <Clock className="size-3.5" aria-hidden />
          Waiting to retry
        </Status>
      );
    case "done":
      return (
        <Status tone="success">
          <Check className="size-3.5" aria-hidden />
          Ready
        </Status>
      );
    case "failed":
      return (
        <Status tone="error">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          Failed: {item.message}
        </Status>
      );
  }
}

function SavedStatus({ resume }: { resume: ResumeListItem }) {
  const { tone, text } = savedResumeStatus(resume);
  return (
    <Status tone={tone}>
      {tone === "success" ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <CircleAlert className="size-3.5 shrink-0" aria-hidden />
      )}
      {text}
    </Status>
  );
}

function Row({
  name,
  status,
  date,
  actions,
}: {
  name: string;
  status: React.ReactNode;
  date?: string;
  actions: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border p-3 last:border-b-0">
      <FileGlyph />
      <div className="min-w-0 flex-1">
        <p className="truncate text-label-14 font-medium" title={name}>
          {name}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {status}
          {date ? (
            <span className="text-copy-13 text-muted-foreground tabular-nums">
              <span aria-hidden>· </span>
              <LocalDate iso={date} />
            </span>
          ) : null}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-0.5">{actions}</span>
    </li>
  );
}

function without(record: Record<string, string>, key: string): Record<string, string> {
  const next = { ...record };
  delete next[key];
  return next;
}

/** The resume drop zone and the list of this job's uploaded resumes. Files go through a small upload queue and each file's progress, retry, download and removal show on its row. */
export function ResumesSection({
  jobId,
  resumes,
}: {
  jobId: string;
  resumes: readonly ResumeListItem[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [engine] = useState(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let halted = false;
    /** At most one refresh per short window, so a 20-file drop does not re-render the page 40 times. */
    const requestRefresh = () => {
      if (halted || timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        router.refresh();
      }, REFRESH_DELAY_MS);
    };
    // DECISION: at most `uploadConcurrency` files are in flight at once. A
    // 20-file drop sent all together would compete for the recruiter's
    // bandwidth, so every file would finish late, and would hit the sign and
    // read routes at once; a small queue finishes files steadily instead.
    const queue = createUploadQueue<UploadJob>({
      limit: RESUME_LIMITS.uploadConcurrency,
      worker: createUploadWorker(jobId, requestRefresh),
    });
    return {
      queue,
      requestRefresh,
      /** Leaving the page: start nothing new, abort running requests, cancel retries, never refresh again. */
      stop: () => {
        halted = true;
        clearTimeout(timer);
        timer = undefined;
        queue.stop();
      },
      start: () => {
        halted = false;
        queue.start();
      },
    };
  });
  const { queue, requestRefresh } = engine;
  const { items, progress } = useSyncExternalStore(queue.subscribe, queue.getState, queue.getState);

  useEffect(() => {
    engine.start();
    return engine.stop;
  }, [engine]);

  const working = progress.queued + progress.running + progress.waiting > 0;
  useEffect(() => {
    if (!working) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [working]);

  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<ReadonlySet<string>>(new Set());
  const [removeErrors, setRemoveErrors] = useState<Record<string, string>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  const savedIds = new Set(resumes.map((resume) => resume.id));
  const isSaved = (item: Item) => savedIds.has(item.payload.progress.resumeId);
  const unsaved = items.filter(
    (item) => (item.stage === "queued" || item.stage === "running" || item.stage === "waiting") && !isSaved(item),
  ).length;

  const localRows = items.filter((item) => !(item.stage === "done" && isSaved(item)));
  const shownLocally = new Set(localRows.map((item) => item.payload.progress.resumeId));
  const savedRows = resumes.filter((resume) => !shownLocally.has(resume.id));
  const retryable = items.filter((item) => item.stage === "failed" && !item.final).length;
  const cancellable = items.filter((item) => item.stage === "queued" && item.attempts === 0).length;

  function addFiles(files: File[]) {
    if (files.length === 0) return;
    const { accepted, rejected: refused } = validateDrop(files, resumes.length + unsaved);
    setRejected((current) => [...current, ...refused]);
    queue.add(
      accepted.map(({ file, contentType }) => ({
        file,
        contentType,
        progress: newUploadProgress(),
      })),
    );
  }

  async function removeItem(item: Item) {
    const { signed, resumeId } = item.payload.progress;
    if (signed) {
      setItemErrors((current) => without(current, item.id));
      const done = await deleteResume(resumeId);
      const verdict = removalVerdict(done);
      if (!verdict.removed) {
        setItemErrors((current) => ({ ...current, [item.id]: verdict.message }));
        return;
      }
      requestRefresh();
    }
    queue.remove(item.id);
  }

  async function removeSaved(resume: ResumeListItem) {
    setRemoving((current) => new Set(current).add(resume.id));
    setRemoveErrors((current) => without(current, resume.id));
    const done = await deleteResume(resume.id);
    const verdict = removalVerdict(done);
    if (verdict.removed) {
      for (const item of items) {
        if (item.payload.progress.resumeId === resume.id) queue.remove(item.id);
      }
      requestRefresh();
    } else {
      setRemoveErrors((current) => ({ ...current, [resume.id]: verdict.message }));
    }
    setRemoving((current) => {
      const next = new Set(current);
      next.delete(resume.id);
      return next;
    });
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  }

  const pickFiles = () => inputRef.current?.click();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="resumes-heading" className="text-heading-20">
            Resumes
          </h2>
          <p className="mt-1 text-copy-14 text-muted-foreground tabular-nums">
            PDF and DOCX files · {resumeCountLabel(resumes.length)} uploaded
          </p>
        </div>
        <Button type="button" variant="outline" onClick={pickFiles}>
          <FilePlus2 data-icon="inline-start" aria-hidden />
          Add files
        </Button>
      </div>

      <div
        role="group"
        aria-labelledby="resume-dropzone-title"
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center rounded-lg border border-dashed px-5 py-8 text-center transition-colors",
          dragging ? "border-ring surface-card" : "border-border-strong surface-subtle",
        )}
      >
        <span
          className="grid size-10 place-items-center rounded-lg border border-border bg-card"
          aria-hidden
        >
          <Upload className="size-4 text-muted-foreground" />
        </span>
        <p id="resume-dropzone-title" className="mt-3 text-label-14 font-medium">
          Drop resumes here, or{" "}
          <Button type="button" variant="link" className="text-label-14 underline" onClick={pickFiles}>
            browse files
          </Button>
        </p>
        <p className="mt-1 max-w-sm text-copy-13 text-muted-foreground">
          {FILE_RULE_MESSAGE} each, up to {RESUME_LIMITS.maxFilesPerDrop} files at a time.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onPick}
        />
      </div>

      <p className="text-copy-13 text-muted-foreground">
        Need files to try it?{" "}
        <a
          href={samplePath(SAMPLE_ZIP)}
          download
          className="focus-ring rounded-sm text-link underline underline-offset-4"
        >
          Download sample resumes
        </a>
      </p>

      {rejected.length > 0 ? (
        <Alert variant="destructive" className="flex items-start justify-between gap-3">
          <ul className="flex min-w-0 flex-col gap-1">
            {rejected.map((item, index) => (
              <li key={`${item.name}-${index}`} className="break-words">
                <span className="font-medium">{item.name}</span>: {item.reason}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Dismiss messages"
            onClick={() => setRejected([])}
          >
            <X aria-hidden />
          </Button>
        </Alert>
      ) : null}

      {progress.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="text-copy-13 text-muted-foreground tabular-nums">
            <span data-testid="upload-progress">
              {progress.done} of {progress.total} done
            </span>
            {progress.failed > 0 ? `, ${progress.failed} failed` : ""}
            {progress.waiting > 0 ? `, ${progress.waiting} waiting to retry` : ""}
          </p>
          <span className="flex items-center gap-1">
            {cancellable > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => queue.cancelQueued()}>
                <X data-icon="inline-start" aria-hidden />
                Cancel remaining
              </Button>
            ) : null}
            {retryable > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => queue.retryAllFailed()}>
                <RotateCw data-icon="inline-start" aria-hidden />
                Retry failed
              </Button>
            ) : null}
          </span>
        </div>
      ) : null}

      {savedRows.length + localRows.length > 0 ? (
        <ul aria-label="Resumes" className="flex flex-col rounded-lg border border-border surface-card">
          {savedRows.map((resume) => (
            <Row
              key={resume.id}
              name={resume.file_name}
              date={resume.created_at}
              status={
                <>
                  <SavedStatus resume={resume} />
                  {removeErrors[resume.id] ? (
                    <Status tone="error">{removeErrors[resume.id]}</Status>
                  ) : null}
                </>
              }
              actions={
                <>
                  {hasStoredFile(resume) ? (
                    <a
                      href={resumeFileHref(resume.id)}
                      aria-label={`Download ${resume.file_name}`}
                      title="Download"
                      className={buttonVariants({
                        variant: "ghost",
                        size: "icon-sm",
                        className: ICON_ACTION,
                      })}
                    >
                      <ArrowDownToLine aria-hidden />
                    </a>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={REMOVE_ACTION}
                    disabled={removing.has(resume.id)}
                    aria-label={`Remove ${resume.file_name}`}
                    title="Remove"
                    onClick={() => void removeSaved(resume)}
                  >
                    {removing.has(resume.id) ? (
                      <LoaderCircle className="animate-spin" aria-hidden />
                    ) : (
                      <Trash2 aria-hidden />
                    )}
                  </Button>
                </>
              }
            />
          ))}
          {localRows.map((item) => (
            <Row
              key={item.id}
              name={item.payload.file.name}
              status={
                <>
                  <UploadStatus item={item} />
                  {itemErrors[item.id] ? <Status tone="error">{itemErrors[item.id]}</Status> : null}
                </>
              }
              actions={
                item.stage === "failed" ? (
                  <>
                    {item.final ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className={ICON_ACTION}
                        aria-label={`Retry ${item.payload.file.name}`}
                        title="Retry"
                        onClick={() => queue.retry(item.id)}
                      >
                        <RotateCw aria-hidden />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className={REMOVE_ACTION}
                      aria-label={`Remove ${item.payload.file.name}`}
                      title="Remove"
                      onClick={() => void removeItem(item)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                ) : null
              }
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
