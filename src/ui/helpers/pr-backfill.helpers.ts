// Settings › Backfill's view state (BackfillStatusProvider and the log
// controls): status badges and details text, which buttons are enabled,
// log auto-scroll, and the log panel text.
export interface BackfillStatus {
  ok?: boolean;
  running?: boolean;
  pid?: string | number;
  summary?: string;
  error?: string;
  logFile?: string;
  pidFile?: string;
}

export interface BackfillBadge {
  text: string;
  className: string;
}

export interface BackfillButtonState {
  startDisabled: boolean;
  stopDisabled: boolean;
  refreshDisabled: boolean;
  refreshLogDisabled: boolean;
}

export interface BackfillStatusViewModel {
  badges: BackfillBadge[];
  detailsText: string;
  isBackfillRunning: boolean;
  buttonState: BackfillButtonState;
  stateKey: string;
}

// Changes only when something the status display shows changes.
const getBackfillStateKey = (backfillRaw: BackfillStatus | null | undefined = {}): string => {
  const backfill = backfillRaw || {};
  return JSON.stringify({
    running: Boolean(backfill.running),
    pid: backfill.pid || "",
    summary: backfill.summary || "",
    error: backfill.error || "",
  });
};

const shouldAutoScrollBackfillLog = ({
  autoScrollEnabled = false,
  isBackfillRunning = false,
}: { autoScrollEnabled?: boolean; isBackfillRunning?: boolean } = {}): boolean =>
  autoScrollEnabled && isBackfillRunning;

const getBackfillScrollTop = ({
  scrollHeight,
  currentScrollTop,
  shouldAutoScroll = false,
}: {
  scrollHeight: unknown;
  currentScrollTop: number;
  shouldAutoScroll?: boolean;
}): number => {
  if (!shouldAutoScroll) {
    return currentScrollTop;
  }
  const height = Number(scrollHeight);
  return Number.isFinite(height) ? height : currentScrollTop;
};

const getBackfillStatusViewModel = ({
  backfillRaw = {},
  isBackfillActionPending = false,
}: {
  backfillRaw?: BackfillStatus | null;
  isBackfillActionPending?: boolean;
} = {}): BackfillStatusViewModel => {
  const backfill = backfillRaw || {};
  const badges: BackfillBadge[] = [
    {
      text: backfill.running ? "Backfill: running" : "Backfill: stopped",
      className: backfill.running
        ? "scheduler-badge-running"
        : "scheduler-badge-stopped",
    },
  ];

  if (backfill.ok === false) {
    badges.push({
      text: "Status error",
      className: "scheduler-badge-error",
    });
  }

  if (backfill.pid) {
    badges.push({
      text: `PID ${backfill.pid}`,
      className: "",
    });
  }

  const lines = [
    `Summary: ${backfill.summary || "-"}`,
    `PID: ${backfill.pid || "-"}`,
    `Log file: ${backfill.logFile || "-"}`,
    `PID file: ${backfill.pidFile || "-"}`,
  ];

  if (backfill.error) {
    lines.push(`Error: ${backfill.error}`);
  }

  return {
    badges,
    detailsText: lines.join("\n"),
    isBackfillRunning: backfill.running === true,
    buttonState: {
      startDisabled: isBackfillActionPending || backfill.running === true,
      stopDisabled: isBackfillActionPending || backfill.running !== true,
      refreshDisabled: isBackfillActionPending,
      refreshLogDisabled: isBackfillActionPending,
    },
    stateKey: getBackfillStateKey(backfill),
  };
};

const formatBackfillLogMessage = ({ summary = "", tail = "" }: { summary?: string; tail?: string } = {}): string => {
  const summaryLine = String(summary || "").trim();
  const logBody = String(tail || "") || "(no log lines yet)";
  return [summaryLine || "Backfill log", "", logBody]
    .filter(Boolean)
    .join("\n");
};

const createPrBackfillHelpers = () => ({
  getBackfillStateKey,
  shouldAutoScrollBackfillLog,
  getBackfillScrollTop,
  getBackfillStatusViewModel,
  formatBackfillLogMessage,
});

export { createPrBackfillHelpers };
