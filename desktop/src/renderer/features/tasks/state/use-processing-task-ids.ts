import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  ConversationRunSnapshot,
  ConversationRunStatus,
  LumoraModelApi,
} from "../../../../shared/model-contract";

type TrackedRunStatus = ConversationRunStatus | "STARTING";

interface ProcessingTaskOptions {
  modelApi?: LumoraModelApi;
  taskIds: readonly string[];
  activeTaskId?: string;
  activeRun?: ConversationRunSnapshot;
  isChatting: boolean;
}

const RUN_STATUS_POLL_INTERVAL_MS = 1_200;
const RUN_DISCOVERY_BATCH_SIZE = 6;
const STARTING_RUN_GRACE_MS = 5_000;

interface RunProbe {
  taskId: string;
  run?: ConversationRunSnapshot;
  failed: boolean;
}

/**
 * Keeps sidebar activity independent from the currently open task. The task page
 * owns the detailed stream, while this tracker only asks Core whether each known
 * run is still active so background tasks can retain their own indicator.
 */
export function useProcessingTaskIds({
  modelApi,
  taskIds,
  activeTaskId,
  activeRun,
  isChatting,
}: ProcessingTaskOptions): ReadonlySet<string> {
  const [trackedRuns, setTrackedRuns] = useState<
    Record<string, TrackedRunStatus>
  >({});
  const trackedRunsRef = useRef(trackedRuns);
  trackedRunsRef.current = trackedRuns;
  const activeProcessingTaskIdRef = useRef<string | undefined>(undefined);
  activeProcessingTaskIdRef.current = isChatting ? activeTaskId : undefined;
  const startingSinceRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!activeTaskId) return;
    const runStatus =
      activeRun?.taskId === activeTaskId ? activeRun.status : undefined;
    if (isChatting && !isTrackedRunStatus(runStatus)) {
      if (!startingSinceRef.current.has(activeTaskId)) {
        startingSinceRef.current.set(activeTaskId, Date.now());
      }
    } else {
      startingSinceRef.current.delete(activeTaskId);
    }

    setTrackedRuns((current) => {
      if (isChatting) {
        const nextStatus = isTrackedRunStatus(runStatus)
          ? runStatus
          : "STARTING";
        return current[activeTaskId] === nextStatus
          ? current
          : { ...current, [activeTaskId]: nextStatus };
      }

      if (
        current[activeTaskId] === "STARTING" ||
        (runStatus !== undefined && !isTrackedRunStatus(runStatus))
      ) {
        return withoutTask(current, activeTaskId);
      }
      return current;
    });
  }, [activeRun, activeTaskId, isChatting]);

  useEffect(() => {
    if (!modelApi || taskIds.length === 0) return;
    let cancelled = false;

    void (async () => {
      for (
        let offset = 0;
        offset < taskIds.length;
        offset += RUN_DISCOVERY_BATCH_SIZE
      ) {
        const batch = taskIds.slice(offset, offset + RUN_DISCOVERY_BATCH_SIZE);
        const results = await Promise.all(
          batch.map((taskId) => probeRun(modelApi, taskId)),
        );
        if (cancelled) return;
        reconcileRuns(
          results,
          setTrackedRuns,
          startingSinceRef.current,
          activeProcessingTaskIdRef.current,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [modelApi, taskIds]);

  useEffect(() => {
    if (!modelApi) return;
    let disposed = false;
    let polling = false;

    const poll = async () => {
      const trackedTaskIds = Object.keys(trackedRunsRef.current);
      if (polling || trackedTaskIds.length === 0) return;
      polling = true;
      try {
        const results = await Promise.all(
          trackedTaskIds.map((taskId) => probeRun(modelApi, taskId)),
        );
        if (!disposed) {
          reconcileRuns(
            results,
            setTrackedRuns,
            startingSinceRef.current,
            activeProcessingTaskIdRef.current,
          );
        }
      } finally {
        polling = false;
      }
    };

    const timer = window.setInterval(
      () => void poll(),
      RUN_STATUS_POLL_INTERVAL_MS,
    );
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [modelApi]);

  return useMemo(() => new Set(Object.keys(trackedRuns)), [trackedRuns]);
}

function isTrackedRunStatus(
  status: ConversationRunStatus | undefined,
): status is Exclude<
  ConversationRunStatus,
  "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED"
> {
  return (
    status === "QUEUED" ||
    status === "RUNNING" ||
    status === "PAUSING" ||
    status === "WAITING_APPROVAL"
  );
}

function reconcileRuns(
  results: RunProbe[],
  setTrackedRuns: Dispatch<SetStateAction<Record<string, TrackedRunStatus>>>,
  startingSince: Map<string, number>,
  activeProcessingTaskId?: string,
) {
  setTrackedRuns((current) => {
    let next = current;
    for (const { taskId, run, failed } of results) {
      if (failed) continue;
      if (run && isTrackedRunStatus(run.status)) {
        startingSince.delete(taskId);
        if (next[taskId] !== run.status) {
          next = next === current ? { ...current } : next;
          next[taskId] = run.status;
        }
      } else if (
        next[taskId] === "STARTING" &&
        (taskId === activeProcessingTaskId ||
          Date.now() - (startingSince.get(taskId) ?? 0) < STARTING_RUN_GRACE_MS)
      ) {
        continue;
      } else if (next[taskId]) {
        startingSince.delete(taskId);
        next = withoutTask(next, taskId);
      }
    }
    return next;
  });
}

async function probeRun(
  modelApi: LumoraModelApi,
  taskId: string,
): Promise<RunProbe> {
  try {
    return { taskId, run: await modelApi.getActiveRun(taskId), failed: false };
  } catch {
    return { taskId, failed: true };
  }
}

function withoutTask<T extends Record<string, unknown>>(
  current: T,
  taskId: string,
): T {
  if (!(taskId in current)) return current;
  const next = { ...current };
  delete next[taskId];
  return next;
}
