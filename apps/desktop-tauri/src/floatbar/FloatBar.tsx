import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useFormattedResetTime } from "../hooks/useFormattedResetTime";
import { useLocale } from "../hooks/useLocale";
import { useProviders } from "../hooks/useProviders";
import {
  getProviderLocalUsageSummary,
  getSettingsSnapshot,
  refreshProvidersIfStale,
} from "../lib/tauri";
import { formatRelativeUpdated } from "../lib/relativeTime";
import type { LocaleKey } from "../i18n/keys";
import { ProviderIcon } from "../components/providers/ProviderIcon";
import { getProviderIcon } from "../components/providers/providerIcons";
import type {
  BootstrapState,
  MetricPreference,
  ProviderLocalUsageSummary,
  ProviderUsageSnapshot,
  RateWindowSnapshot,
  SettingsSnapshot,
} from "../types/bridge";
import { FLOAT_BAR_CONFIG_CHANGED_EVENT, resizeFloatBar } from "./api";
import "./FloatBar.css";

/**
 * Cadence classification for the three fixed Float Bar usage positions.
 *
 * A known `windowMinutes` always wins; label fallback is used only when the
 * duration is absent, because labels are not a reliable source of truth.
 */
type UsageCadence = "5h" | "weekly" | "monthly";
type FloatBarBatterySlot = UsageCadence | "fallback";
type UsageSlots = Record<UsageCadence, RateWindowSnapshot | null>;

const USAGE_CADENCES: readonly UsageCadence[] = ["5h", "weekly", "monthly"];

function isBatterySlotEnabled(
  selectedSlots: readonly string[] | undefined,
  slot: FloatBarBatterySlot,
): boolean {
  const selected = selectedSlots ?? [];
  // An empty persisted list is the backwards-compatible "all slots" default.
  // A non-empty list with no recognized values therefore selects none, while
  // unknown values alongside known ones are harmlessly ignored.
  return selected.length === 0 || selected.includes(slot);
}

function cadenceFromMinutes(minutes: number): UsageCadence | null {
  if (minutes === 300) return "5h";
  // Actual Gregorian months run 28-31 days (40,320-44,640 minutes); anything
  // above that range is unsupported rather than weekly or monthly.
  if (minutes >= 40_320 && minutes <= 44_640) return "monthly";
  if (minutes >= 10_080 && minutes < 40_320) return "weekly";
  return null;
}

function cadenceFromLabel(label: string | undefined): UsageCadence | null {
  const normalized = label?.trim().toLowerCase() ?? "";
  if (/(^|[^a-z0-9])5\s*(?:-|\s)?(?:h|hour)(?:s)?([^a-z0-9]|$)/.test(normalized)) return "5h";
  if (/(^|[^a-z0-9])(?:weekly|7[ -]?day)([^a-z0-9]|$)/.test(normalized)) return "weekly";
  if (/(^|[^a-z0-9])monthly([^a-z0-9]|$)/.test(normalized)) return "monthly";
  return null;
}

function selectFloatBarUsageSlots(provider: ProviderUsageSnapshot): UsageSlots {
  const slots: UsageSlots = { "5h": null, weekly: null, monthly: null };
  const candidates = [
    [provider.primary, provider.primaryLabel],
    [provider.secondary, provider.secondaryLabel],
    [provider.tertiary, provider.tertiaryLabel],
  ] as const;

  for (const [window, label] of candidates) {
    if (!window || window.isInformational) continue;
    const cadence =
      window.windowMinutes == null
        ? cadenceFromLabel(label)
        : cadenceFromMinutes(window.windowMinutes);
    if (cadence && !slots[cadence]) slots[cadence] = window;
  }
  return slots;
}

function maxFloatBarUsedPercent(
  provider: ProviderUsageSnapshot,
  preference?: MetricPreference | undefined,
): number {
  const slots = Object.values(selectFloatBarUsageSlots(provider)).filter(
    (window): window is RateWindowSnapshot => window !== null,
  );
  if (slots.length > 0) {
    return Math.max(
      0,
      ...slots.map((window) => Math.max(0, Math.min(100, window.usedPercent))),
    );
  }
  const fallback = fallbackFor(provider, preference);
  if (!fallback) return 0;
  return Math.max(0, Math.min(100, fallback.window.usedPercent));
}

/**
 * Detect the known Antigravity-not-running error so the pill can show a
 * compact, non-identity overlay message next to the Antigravity icon.
 */
function isAntigravityNotRunningError(provider: ProviderUsageSnapshot): boolean {
  return (
    provider.providerId === "antigravity" &&
    /antigravity language server not running/i.test(provider.error ?? "")
  );
}

/**
 * A single fallback metric for providers whose canonical windows carry no
 * recognizable cadence. The visible label prefers the provider's own window
 * label (primaryLabel/secondaryLabel/tertiaryLabel) and only falls back to a
 * generic localized identity when the provider did not supply one.
 * Model-specific has no bridge label, so it always uses the generic key.
 */
type FallbackMetric = {
  window: RateWindowSnapshot;
  providerLabel: string | null;
  labelKey: LocaleKey;
};

/** One canonical window candidate with its provider label and generic key. */
type FallbackCandidate = {
  window: RateWindowSnapshot | null;
  providerLabel: string | null;
  labelKey: LocaleKey;
};

function fallbackFor(
  provider: ProviderUsageSnapshot,
  preference: MetricPreference | undefined,
): FallbackMetric | null {
  const candidates: FallbackCandidate[] = [
    {
      window: provider.modelSpecific,
      providerLabel: null,
      labelKey: "DetailWindowModelSpecific",
    },
    {
      window: provider.primary,
      providerLabel: provider.primaryLabel ?? null,
      labelKey: "ProviderSessionLabel",
    },
    {
      window: provider.secondary,
      providerLabel: provider.secondaryLabel ?? null,
      labelKey: "ProviderWeeklyLabel",
    },
    {
      window: provider.tertiary,
      providerLabel: provider.tertiaryLabel ?? null,
      labelKey: "DetailWindowTertiary",
    },
  ];

  // Explicit preference -> the matching window, when present and not
  // informational. Anything else (automatic, unsupported, absent,
  // informational) falls through to the automatic order:
  // modelSpecific -> primary -> secondary -> tertiary.
  const preferredIndex =
    preference === "session"
      ? 1
      : preference === "weekly"
        ? 2
        : preference === "model"
          ? 0
          : preference === "tertiary"
            ? 3
            : -1;
  const preferred = preferredIndex >= 0 ? candidates[preferredIndex] : null;
  if (preferred?.window && !preferred.window.isInformational) {
    return {
      window: preferred.window,
      providerLabel: preferred.providerLabel,
      labelKey: preferred.labelKey,
    };
  }

  for (const candidate of candidates) {
    if (candidate.window && !candidate.window.isInformational) {
      return {
        window: candidate.window,
        providerLabel: candidate.providerLabel,
        labelKey: candidate.labelKey,
      };
    }
  }
  return null;
}

/**
 * Locale-independent compact countdown for the visible Float Bar slot value.
 * Never derives from localized prose, so it stays compact in every language.
 */
function compactResetTime(resetsAt: string): string | null {
  const target = Date.parse(resetsAt);
  if (Number.isNaN(target)) return null;
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "now";
  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  if (totalMinutes >= 1440) return `${Math.floor(totalMinutes / 1440)}d`;
  return `${Math.floor(totalMinutes / 60)}h`;
}

/**
 * Detailed two-unit countdown used only by the exhausted hide-percent mode.
 * Floor semantics, locale-independent: under an hour renders `Xm`, under a
 * day renders `Xh Ym` (`Y` omitted when zero), otherwise `Xd Xh` (`X` omitted
 * when zero). Returns null for missing/invalid/expired timestamps.
 */
function compactDetailedResetTime(resetsAt: string): string | null {
  const target = Date.parse(resetsAt);
  if (Number.isNaN(target)) return null;
  const diffMs = target - Date.now();
  if (diffMs <= 0) return null;
  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  if (totalMinutes < 1440) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfLocalDayMillis(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Absolute local clock rendering for the exhausted hide-percent mode.
 * Same calendar day renders `HH:MM` (zero-padded 24-hour); any other day
 * renders `M/D HH:MM`. When `useWeekday` is set and the reset falls within
 * the coming week (1..=6 local calendar days ahead — never the same weekday
 * twice), the date is replaced by its weekday abbreviation (`Mon HH:MM`).
 * Returns null for missing/invalid/expired timestamps.
 */
function clockResetTime(resetsAt: string, useWeekday: boolean): string | null {
  const target = Date.parse(resetsAt);
  if (Number.isNaN(target)) return null;
  if (target <= Date.now()) return null;
  const date = new Date(target);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const clock = `${hh}:${mm}`;
  if (sameDay) return clock;
  const dayDiff = Math.round(
    (startOfLocalDayMillis(date) - startOfLocalDayMillis(now)) / 86_400_000,
  );
  if (useWeekday && dayDiff >= 1 && dayDiff <= 6) {
    return `${WEEKDAYS_SHORT[date.getDay()]} ${clock}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${clock}`;
}

type FloatBarCostSummary = {
  key: string;
  providerId: string;
  displayName: string;
  todayCost: number | null;
  thirtyDayCost: number | null;
};

type FloatBarCostTarget = {
  key: string;
  providerId: string;
  displayName: string;
};

function providerCostKey(provider: ProviderUsageSnapshot): string {
  return `${provider.providerId}:${provider.accountEmail ?? ""}`;
}

function hasLocalCost(summary: ProviderLocalUsageSummary | null): summary is ProviderLocalUsageSummary {
  return summary?.todayCost != null || summary?.thirtyDayCost != null;
}

function formatUsd(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `$${value.toFixed(2)}`;
}

function CostPill({
  summary,
  scale,
  todayLabel,
  thirtyDayLabel,
}: {
  summary: FloatBarCostSummary;
  scale: number;
  todayLabel: string;
  thirtyDayLabel: string;
}) {
  const today = formatUsd(summary.todayCost);
  const thirtyDay = formatUsd(summary.thirtyDayCost);
  const iconSize = Math.round(10 * scale);
  const brand = getProviderIcon(summary.providerId).brandColor;
  const title = [
    today ? `${todayLabel} ${today}` : null,
    thirtyDay ? `${thirtyDayLabel} ${thirtyDay}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <div
      className="floatbar__cost-pill"
      title={`${summary.displayName}: ${title}`}
      data-tauri-drag-region
      style={{ "--brand": brand } as CSSProperties}
    >
      <span className="floatbar__provider-icon" data-tauri-drag-region>
        <ProviderIcon providerId={summary.providerId} size={iconSize} />
      </span>
      <span className="floatbar__cost-items" data-tauri-drag-region>
        {today && (
          <span className="floatbar__cost-item" data-tauri-drag-region>
            <span className="floatbar__cost-label" data-tauri-drag-region>
              {todayLabel}
            </span>
            <span className="floatbar__cost-value" data-tauri-drag-region>
              {today}
            </span>
          </span>
        )}
        {thirtyDay && (
          <span className="floatbar__cost-item" data-tauri-drag-region>
            <span className="floatbar__cost-label" data-tauri-drag-region>
              {thirtyDayLabel}
            </span>
            <span className="floatbar__cost-value" data-tauri-drag-region>
              {thirtyDay}
            </span>
          </span>
        )}
      </span>
    </div>
  );
}
/**
 * One fixed quota slot in the Float Bar provider pill.
 *
 * Renders only the compact visible value. The pill itself carries the full
 * cadence/used/reset detail on its title and accessible name, because pill
 * children intentionally have `pointer-events: none`. Each metric colors
 * itself from its own used or remaining percentage; battery metrics always
 * use remaining quota. Red marks the critical threshold (or provider error /
 * exhaustion), amber marks the high-usage threshold, otherwise neutral.
 */
function UsageMetric({
  window: rateWindow,
  providerError,
  showResetInline,
  hidePercentWhenExhausted,
  exhaustedClockTime,
  exhaustedWeekdayTime,
  highUsage,
  critUsage,
  label,
  batteryEnabled = false,
  showRemaining = false,
  remainingSuffix,
}: {
  window: RateWindowSnapshot | null;
  providerError: boolean;
  showResetInline: boolean;
  hidePercentWhenExhausted: boolean;
  exhaustedClockTime: boolean;
  exhaustedWeekdayTime: boolean;
  highUsage: number;
  critUsage: number;
  label?: string;
  batteryEnabled?: boolean;
  showRemaining?: boolean;
  /** Suffix appended to the battery meter's accessible name. */
  remainingSuffix?: string;
}) {
  const used = rateWindow ? Math.max(0, Math.min(100, rateWindow.usedPercent)) : null;
  const remaining = used === null ? null : Math.max(0, Math.min(100, 100 - used));
  const displayValue = showRemaining ? remaining : used;
  const target = rateWindow?.resetsAt ? Date.parse(rateWindow.resetsAt) : Number.NaN;
  const hasFutureReset = Number.isFinite(target) && target > Date.now();
  const compactReset =
    hasFutureReset && rateWindow?.resetsAt ? compactResetTime(rateWindow.resetsAt) : null;
  const detailedReset =
    hasFutureReset && rateWindow?.resetsAt ? compactDetailedResetTime(rateWindow.resetsAt) : null;
  const clockReset =
    hasFutureReset && rateWindow?.resetsAt
      ? clockResetTime(rateWindow.resetsAt, exhaustedWeekdayTime)
      : null;
  // Hide-percent mode: exhausted slots with a live reset show only the
  // remaining time — a relative two-unit countdown (`4d 12h`) or, when the
  // clock-style option is on, a local absolute time (`9/18 17:30`, `17:30`
  // on the same day). Without a usable reset the percentage is kept so the
  // slot never goes blank.
  const hidePercent =
    hidePercentWhenExhausted &&
    Boolean(rateWindow?.isExhausted) &&
    !providerError &&
    detailedReset != null;
  const hiddenTime = exhaustedClockTime ? (clockReset ?? detailedReset) : detailedReset;
  const batteryValue = remaining;
  const isBattery = batteryEnabled && batteryValue != null && !providerError && !hidePercent;
  const visible =
    displayValue == null || providerError
      ? "—"
      : hidePercent
        ? (hiddenTime ?? `${Math.round(displayValue)}%`)
        : `${Math.round(displayValue)}%${showResetInline && compactReset ? ` ${compactReset}` : ""}`;

  // Battery tones always describe remaining quota. Percentage text keeps the
  // existing used/remaining semantics controlled by showRemaining.
  const toneValue = isBattery ? batteryValue : displayValue;
  const toneUsesRemaining = isBattery || showRemaining;
  const tone =
    providerError ||
    rateWindow?.isExhausted ||
    (toneValue != null &&
      (toneUsesRemaining ? toneValue <= 100 - critUsage : toneValue >= critUsage))
      ? "crit"
      : toneValue != null &&
          (toneUsesRemaining ? toneValue <= 100 - highUsage : toneValue >= highUsage)
        ? "warn"
        : "ok";

  return (
    <span
      className={
        tone === "ok"
          ? `floatbar__metric${isBattery ? " floatbar__metric--battery" : ""}`
          : `floatbar__metric floatbar__metric--${tone}${isBattery ? " floatbar__metric--battery" : ""}`
      }
      data-tauri-drag-region
    >
      {label ? <span className="floatbar__metric-label">{label} </span> : null}
      {isBattery ? (
        <>
          <span
            className="floatbar__battery"
            role="meter"
            aria-valuenow={Math.round(batteryValue!)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${Math.round(batteryValue!)}%${remainingSuffix ? ` ${remainingSuffix}` : ""}`}
            data-tauri-drag-region
          >
            <span className="floatbar__battery-cell" data-tauri-drag-region>
              <span
                className="floatbar__battery-fill"
                style={{ width: `${batteryValue!}%` }}
                data-tauri-drag-region
              />
            </span>
            <span className="floatbar__battery-nub" aria-hidden="true" data-tauri-drag-region />
          </span>
          {showResetInline && compactReset ? (
            <span className="floatbar__battery-reset" data-tauri-drag-region>
              {compactReset}
            </span>
          ) : null}
        </>
      ) : (
        visible
      )}
    </span>
  );
}

/**
 * The capacity pill shown for a single provider.
 *
 * Renders fixed 5-hour / weekly / monthly usage slots (or the cadence-less
 * fallback metric). The pill, icon, and container stay visually neutral;
 * each usage metric colors itself from its own used/remaining percentage,
 * while battery metrics always use remaining quota. The
 * full per-slot detail (cadence, used percentage, localized reset) lives on
 * the pill `title` and `aria-label` so it stays hoverable/accessible.
 */
function ProviderPill({
  provider,
  highUsage,
  critUsage,
  scale,
  showResetInline,
  hidePercentWhenExhausted,
  exhaustedClockTime,
  exhaustedWeekdayTime,
  resetRelative,
  usedSuffix,
  remainingSuffix,
  showRemaining,
  batterySlots,
  preference,
  now,
  t,
  batteryStyle = false,
}: {
  provider: ProviderUsageSnapshot;
  highUsage: number;
  critUsage: number;
  scale: number;
  showResetInline: boolean;
  hidePercentWhenExhausted: boolean;
  exhaustedClockTime: boolean;
  exhaustedWeekdayTime: boolean;
  resetRelative: boolean;
  usedSuffix: string;
  remainingSuffix: string;
  /** When true, every percentage this pill reports is remaining quota. */
  showRemaining: boolean;
  /** Selected battery slots; empty means all slots. */
  batterySlots?: readonly string[];
  preference: MetricPreference | undefined;
  now: number;
  t: (key: LocaleKey) => string;
  batteryStyle?: boolean;
}) {
  const slots = selectFloatBarUsageSlots(provider);
  const fallback = Object.values(slots).some((window) => window !== null)
    ? null
    : fallbackFor(provider, preference);
  const hasError = Boolean(provider.error);
  const batteryEnabledFor = (slot: FloatBarBatterySlot) =>
    batteryStyle && isBatterySlotEnabled(batterySlots, slot);
  // "Show remaining" flips every percentage this pill reports — the metric
  // values and the cadence/fallback detail lines — to remaining quota.
  const shownPercent = (percent: number) => {
    const clamped = Math.max(0, Math.min(100, percent));
    return Math.round(showRemaining ? 100 - clamped : clamped);
  };
  const agyOverlay = isAntigravityNotRunningError(provider)
    ? t("FloatBarAgyRunNeeded")
    : null;

  // One reset hook per fixed slot plus one for the fallback, all called
  // unconditionally in stable order.
  const reset5h = useFormattedResetTime(slots["5h"]?.resetsAt ?? null, null, resetRelative);
  const resetWeekly = useFormattedResetTime(slots.weekly?.resetsAt ?? null, null, resetRelative);
  const resetMonthly = useFormattedResetTime(slots.monthly?.resetsAt ?? null, null, resetRelative);
  const resetFallback = useFormattedResetTime(
    fallback?.window.resetsAt ?? null,
    null,
    resetRelative,
  );
  const resetTexts = [reset5h, resetWeekly, resetMonthly];

  const slotDetails = USAGE_CADENCES.map((cadence, index) => {
    const window = slots[cadence];
    if (!window) return `${cadence}: —`;
    const used = shownPercent(window.usedPercent);
    const reset = resetTexts[index];
    return `${cadence}: ${used}% ${usedSuffix}${reset ? `\n${reset}` : ""}`;
  });
  let pillDetail: string;
  const fallbackLabel =
    hasError || !fallback ? "" : (fallback.providerLabel ?? t(fallback.labelKey));
  if (provider.error) {
    pillDetail = `${provider.displayName}: ${provider.error}`;
  } else if (fallback) {
    const used = shownPercent(fallback.window.usedPercent);
    pillDetail = `${provider.displayName}: ${fallbackLabel}: ${used}% ${usedSuffix}${resetFallback ? `\n${resetFallback}` : ""}`;
  } else {
    pillDetail = `${provider.displayName}: ${slotDetails.join("\n")}`;
  }
  // Relative last-refresh line for the hover/accessibility detail. A single
  // shared 30-second clock at the FloatBar surface re-renders all pills, so
  // the text advances even when no slot has a future reset timestamp. An
  // unparseable `updatedAt` keeps its raw value after the localized label.
  const updatedAtMs = Date.parse(provider.updatedAt);
  const updatedDetail = Number.isNaN(updatedAtMs)
    ? `${t("LastUpdated")}: ${provider.updatedAt}`
    : `${t("LastUpdated")}: ${formatRelativeUpdated(updatedAtMs, t, now)}`;
  pillDetail = `${pillDetail}\n${updatedDetail}`;

  const brand = getProviderIcon(provider.providerId).brandColor;
  const iconSize = Math.round(11 * scale);

  return (
    <div
      role="group"
      className="floatbar__pill"
      title={pillDetail}
      aria-label={pillDetail}
      data-tauri-drag-region
      style={{ "--brand": brand } as CSSProperties}
    >
      <span className="floatbar__provider-icon" data-tauri-drag-region>
        <ProviderIcon providerId={provider.providerId} size={iconSize} />
      </span>
      <span className="floatbar__metrics" data-tauri-drag-region>
        {agyOverlay ? (
          <span
            className="floatbar__metric floatbar__metric--crit floatbar__agy-overlay"
            data-tauri-drag-region
          >
            {agyOverlay}
          </span>
        ) : fallback ? (
          <UsageMetric
            window={fallback.window}
            providerError={hasError}
            showResetInline={showResetInline}
            hidePercentWhenExhausted={hidePercentWhenExhausted}
            exhaustedClockTime={exhaustedClockTime}
            exhaustedWeekdayTime={exhaustedWeekdayTime}
            highUsage={highUsage}
            critUsage={critUsage}
            label={fallbackLabel}
            batteryEnabled={batteryEnabledFor("fallback")}
            showRemaining={showRemaining}
            remainingSuffix={remainingSuffix}
          />
        ) : (
          USAGE_CADENCES.map((cadence, index) => (
            <Fragment key={cadence}>
              {index > 0 && <span className="floatbar__metric-separator">/</span>}
              <UsageMetric
                window={slots[cadence]}
                providerError={hasError}
                showResetInline={showResetInline}
                hidePercentWhenExhausted={hidePercentWhenExhausted}
                exhaustedClockTime={exhaustedClockTime}
                exhaustedWeekdayTime={exhaustedWeekdayTime}
                highUsage={highUsage}
                critUsage={critUsage}
                batteryEnabled={batteryEnabledFor(cadence)}
                showRemaining={showRemaining}
                remainingSuffix={remainingSuffix}
              />
            </Fragment>
          ))
        )}
      </span>
    </div>
  );
}

/**
 * The always-on-top floating capacity bar.
 *
 * Renders a tiny strip of provider pills. Listens to the same provider
 * refresh cycle as the rest of the app via `useProviders`, and reacts to
 * setting changes (filter list, orientation) live without a reload.
 */
export default function FloatBar({ state }: { state: BootstrapState }) {
  const { t } = useLocale();
  const { providers } = useProviders({
    refreshOnMount: false,
  });
  const startDrag = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    void getCurrentWindow().startDragging().catch(() => {});
  }, []);

  // Mark the body so our CSS can strip the dark theme background — the
  // floatbar window is meant to be fully transparent around the pills.
  useEffect(() => {
    document.body.classList.add("floatbar-window");
    return () => {
      document.body.classList.remove("floatbar-window");
    };
  }, []);

  // Local settings: event stream is source of truth after mount; re-seed
  // if the bootstrap prop identity changes (rare parent remount path).
  const [settings, setSettings] = useState(state.settings);
  const [settingsSeed, setSettingsSeed] = useState(state.settings);
  if (state.settings !== settingsSeed) {
    setSettingsSeed(state.settings);
    setSettings(state.settings);
  }
  const [localCosts, setLocalCosts] = useState<Record<string, FloatBarCostSummary>>({});

  // Single shared 30-second clock so relative "updated N ago" hover text
  // advances for every provider without a per-pill timer.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // The detached floatbar should keep usage fresh, but it must not open or
  // focus any other surface. Refresh data only; provider-updated events feed
  // this window when the backend completes. Respect Low Power Mode's 30-min
  // floor for automatic ticks (manual refresh stays elsewhere/immediate).
  useEffect(() => {
    const baseMs = Math.max(60_000, settings.refreshIntervalSecs * 1000);
    const intervalMs = settings.lowPowerMode
      ? Math.max(baseMs, 30 * 60 * 1000)
      : baseMs;
    const tick = () => {
      void refreshProvidersIfStale().catch(() => {});
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [settings.refreshIntervalSecs, settings.lowPowerMode]);

  useEffect(() => {
    const unlisten = listen(FLOAT_BAR_CONFIG_CHANGED_EVENT, () => {
      void getSettingsSnapshot().then(setSettings).catch(() => {});
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Orientation flips re-lay-out the bar without recreating the window.
  const orientation: "horizontal" | "vertical" =
    settings.floatBarOrientation === "vertical" ? "vertical" : "horizontal";
  const style = settings.floatBarStyle === "taskbar" ? "taskbar" : "floating";
  const filterIds = settings.floatBarProviderIds;
  const scale = Math.max(0.75, Math.min(2, settings.floatBarScale / 100));
  const showResetInline = settings.floatBarShowResetInline;
  const hidePercentWhenExhausted = settings.floatBarHidePercentWhenExhausted;
  const exhaustedClockTime = settings.floatBarExhaustedClockTime;
  const exhaustedWeekdayTime = settings.floatBarExhaustedWeekdayTime;
  const showCost = settings.floatBarShowCost;
  // "Show remaining" flips both the rendered percentage and the word beside it
  // in each pill's hover/accessible detail (used ↔ remaining).
  const showRemaining = settings.floatBarShowRemaining;
  const usedSuffix = t(showRemaining ? "FloatBarRemainingSuffix" : "PanelUsedSuffix");
  const remainingSuffix = t("FloatBarRemainingSuffix");
  const batterySlots = settings.floatBarBatterySlots ?? [];
  const visible = useMemo(() => {
    const enabled = new Set(settings.enabledProviders);
    let list = providers.filter((p) => enabled.has(p.providerId));
    if (filterIds && filterIds.length > 0) {
      const wanted = new Set(filterIds);
      list = list.filter((p) => wanted.has(p.providerId));
    }
    return [...list].sort(
      (a, b) =>
        maxFloatBarUsedPercent(b, settings.providerMetrics[b.providerId]) -
        maxFloatBarUsedPercent(a, settings.providerMetrics[a.providerId]),
    );
  }, [providers, settings.enabledProviders, filterIds, settings.providerMetrics]);

  const visibleCostTargets = useMemo<FloatBarCostTarget[]>(
    () =>
      showCost
        ? visible.map((provider) => ({
            key: providerCostKey(provider),
            providerId: provider.providerId,
            displayName: provider.displayName,
          }))
        : [],
    [showCost, visible],
  );

  useEffect(() => {
    let cancelled = false;
    const targets = visibleCostTargets;

    if (targets.length === 0) {
      setLocalCosts({});
      return () => {
        cancelled = true;
      };
    }

    Promise.allSettled(
      targets.map(async (target) => {
        const localUsage = await getProviderLocalUsageSummary(target.providerId);
        if (!hasLocalCost(localUsage)) return null;
        return {
          key: target.key,
          providerId: target.providerId,
          displayName: target.displayName,
          todayCost: localUsage.todayCost,
          thirtyDayCost: localUsage.thirtyDayCost,
        } satisfies FloatBarCostSummary;
      }),
    )
      .then((results) => {
        if (cancelled) return;
        const next: Record<string, FloatBarCostSummary> = {};
        for (const result of results) {
          if (result.status === "fulfilled" && result.value) {
            next[result.value.key] = result.value;
          }
        }
        setLocalCosts(next);
      })
      .catch(() => {
        if (!cancelled) setLocalCosts({});
      });

    return () => {
      cancelled = true;
    };
  }, [visibleCostTargets]);

  const visibleCosts = visible
    .map((provider) => localCosts[providerCostKey(provider)])
    .filter((summary): summary is FloatBarCostSummary => Boolean(summary));
  const visibleCostValuesKey = visibleCosts
    .map((summary) => `${summary.key}:${summary.todayCost ?? ""}:${summary.thirtyDayCost ?? ""}`)
    .join("|");
  // Keep the native floatbar window fitted when late data/fonts/icons change layout.
  const lastResizeRef = useRef<{ w: number; h: number } | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const resizeToContent = useCallback(() => {
    const el = document.querySelector<HTMLElement>(".floatbar");
    if (!el) return;
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current);
    }
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = null;
      const rect = el.getBoundingClientRect();
      const padding = 8;
      const dpr =
        Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
          ? window.devicePixelRatio
          : 1;
      // DOM measurements are CSS pixels; the native command accepts physical
      // pixels so the window remains correctly sized on scaled displays.
      const w = Math.ceil(Math.ceil(rect.width + padding) * dpr);
      const h = Math.ceil(Math.ceil(rect.height + padding) * dpr);
      const last = lastResizeRef.current;
      if (last && Math.abs(last.w - w) <= 1 && Math.abs(last.h - h) <= 1) return;
      lastResizeRef.current = { w, h };
      void resizeFloatBar(w, h).catch(() => {});
    });
  }, []);

  useEffect(() => {
    resizeToContent();
  }, [
    resizeToContent,
    visible.length,
    visibleCostValuesKey,
    orientation,
    style,
    scale,
    showResetInline,
    hidePercentWhenExhausted,
    exhaustedClockTime,
    exhaustedWeekdayTime,
    settings.floatBarBatteryStyle,
    batterySlots,
    settings.resetTimeRelative,
    showRemaining,
  ]);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".floatbar");
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resizeToContent);
    observer.observe(el);
    return () => observer.disconnect();
  }, [resizeToContent]);

  useEffect(() => {
    // Re-measure after moving onto a monitor with a different scale factor.
    window.addEventListener("resize", resizeToContent);
    return () => window.removeEventListener("resize", resizeToContent);
  }, [resizeToContent]);

  useEffect(
    () => () => {
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current);
      }
    },
    [],
  );

  const opacityFraction = Math.max(0.3, Math.min(1, settings.floatBarOpacity / 100));

  return (
    <div
      role="group"
      tabIndex={-1}
      aria-label={t("AppName")}
      className={`floatbar floatbar--${orientation} floatbar--${style}${settings.floatBarDarkText ? " floatbar--light-bg" : ""}`}
      data-tauri-drag-region
      onMouseDown={startDrag}
      style={
        {
          opacity: opacityFraction,
          "--floatbar-scale": scale,
          "--floatbar-background-color": settings.floatBarBackgroundColor,
          "--floatbar-background-opacity": `${Math.max(
            0,
            Math.min(100, settings.floatBarBackgroundOpacity),
          )}%`,
        } as CSSProperties
      }
    >
      <div className="floatbar__handle" data-tauri-drag-region aria-hidden />
      {visible.length === 0 ? (
        <div className="floatbar__empty" data-tauri-drag-region>
          {t("FloatBarNoProviders")}
        </div>
      ) : (
        <>
          {visible.map((p) => (
            <ProviderPill
              key={providerCostKey(p)}
              provider={p}
              highUsage={settings.highUsageThreshold}
              critUsage={settings.criticalUsageThreshold}
              scale={scale}
              showResetInline={showResetInline}
              hidePercentWhenExhausted={hidePercentWhenExhausted}
              exhaustedClockTime={exhaustedClockTime}
              exhaustedWeekdayTime={exhaustedWeekdayTime}
              resetRelative={settings.resetTimeRelative}
              usedSuffix={usedSuffix}
              remainingSuffix={remainingSuffix}
              showRemaining={showRemaining}
              batterySlots={batterySlots}
              preference={settings.providerMetrics[p.providerId]}
              now={now}
              t={t}
              batteryStyle={settings.floatBarBatteryStyle}
            />
          ))}
          {visibleCosts.map((summary) => (
            <CostPill
              key={`cost:${summary.key}`}
              summary={summary}
              scale={scale}
              todayLabel={t("PanelToday")}
              thirtyDayLabel={t("FloatBarThirtyDayShort")}
            />
          ))}
        </>
      )}
    </div>
  );
}
