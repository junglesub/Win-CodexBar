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
import { ProviderIcon } from "../components/providers/ProviderIcon";
import { getProviderIcon } from "../components/providers/providerIcons";
import type {
  BootstrapState,
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
type UsageSlots = Record<UsageCadence, RateWindowSnapshot | null>;

const USAGE_CADENCES: readonly UsageCadence[] = ["5h", "weekly", "monthly"];

function cadenceFromMinutes(minutes: number): UsageCadence | null {
  if (minutes === 300) return "5h";
  if (minutes >= 43_200) return "monthly";
  if (minutes >= 10_080) return "weekly";
  return null;
}

function cadenceFromLabel(label: string | undefined): UsageCadence | null {
  const normalized = label?.trim().toLowerCase() ?? "";
  if (/(^|[^a-z0-9])5\s*(?:h|hour)(?:s)?([^a-z0-9]|$)/.test(normalized)) return "5h";
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

function maxFloatBarUsedPercent(provider: ProviderUsageSnapshot): number {
  return Math.max(
    0,
    ...Object.values(selectFloatBarUsageSlots(provider))
      .filter((window): window is RateWindowSnapshot => window !== null)
      .map((window) => Math.max(0, Math.min(100, window.usedPercent))),
  );
}

function inlineResetTime(resetText: string): string {
  const normalized = resetText.trim();
  if (/^reset(?:s|ting)?(?:\s+due)?\s*(?:now)?$/i.test(normalized)) {
    return "now";
  }
  return normalized
    .replace(/^resets?\s+in\s+/i, "")
    .replace(/^resets?\s+/i, "")
    .trim();
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
 * Values are always consumed percentages; the global `showAsUsed` setting
 * does not apply. Missing or informational windows render as `—`, and the
 * tooltip/accessible name always carries the cadence, percentage, and reset.
 */
function UsageMetric({
  cadence,
  window: rateWindow,
  providerError,
  showResetInline,
  usedSuffix,
}: {
  cadence: UsageCadence;
  window: RateWindowSnapshot | null;
  providerError: boolean;
  showResetInline: boolean;
  usedSuffix: string;
}) {
  const resetText = useFormattedResetTime(rateWindow?.resetsAt ?? null, null, true);
  const used = rateWindow ? Math.max(0, Math.min(100, rateWindow.usedPercent)) : null;
  const target = rateWindow?.resetsAt ? Date.parse(rateWindow.resetsAt) : Number.NaN;
  const hasFutureReset = Number.isFinite(target) && target > Date.now();
  const visible = showResetInline && hasFutureReset && resetText
    ? inlineResetTime(resetText)
    : used == null || providerError
      ? "—"
      : `${Math.round(used)}%`;
  const detail = used == null || providerError
    ? `${cadence}: —`
    : `${cadence}: ${Math.round(used)}% ${usedSuffix}${resetText ? `\n${resetText}` : ""}`;

  return (
    <span className="floatbar__metric" title={detail} aria-label={detail} data-tauri-drag-region>
      {visible}
    </span>
  );
}

/**
 * The capacity pill shown for a single provider.
 *
 * Renders fixed 5-hour / weekly / monthly usage slots. Color follows usage:
 * green default, amber at/above the high-usage threshold, red at/above the
 * critical threshold or when the provider is exhausted.
 */
function ProviderPill({
  provider,
  highUsage,
  critUsage,
  scale,
  showResetInline,
  usedSuffix,
}: {
  provider: ProviderUsageSnapshot;
  highUsage: number;
  critUsage: number;
  scale: number;
  showResetInline: boolean;
  usedSuffix: string;
}) {
  const slots = selectFloatBarUsageSlots(provider);
  const maxUsed = maxFloatBarUsedPercent(provider);
  const exhausted = provider.primary.isExhausted || provider.error;
  let tone: "ok" | "warn" | "crit" = "ok";
  if (exhausted || maxUsed >= critUsage) tone = "crit";
  else if (maxUsed >= highUsage) tone = "warn";

  const brand = getProviderIcon(provider.providerId).brandColor;
  const iconSize = Math.round(11 * scale);
  const pillSummary = USAGE_CADENCES.map((cadence) => {
    const window = slots[cadence];
    return window ? `${Math.round(Math.max(0, Math.min(100, window.usedPercent)))}%` : "—";
  }).join(" / ");

  return (
    <div
      className={`floatbar__pill floatbar__pill--${tone}`}
      title={`${provider.displayName}: ${pillSummary} used`}
      data-tauri-drag-region
      style={{ "--brand": brand } as CSSProperties}
    >
      <span className="floatbar__provider-icon" data-tauri-drag-region>
        <ProviderIcon providerId={provider.providerId} size={iconSize} />
      </span>
      <span className="floatbar__metrics" data-tauri-drag-region>
        {USAGE_CADENCES.map((cadence, index) => (
          <Fragment key={cadence}>
            {index > 0 && <span className="floatbar__metric-separator">/</span>}
            <UsageMetric
              cadence={cadence}
              window={slots[cadence]}
              providerError={Boolean(provider.error)}
              showResetInline={showResetInline}
              usedSuffix={usedSuffix}
            />
          </Fragment>
        ))}
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
  const showCost = settings.floatBarShowCost;
  const visible = useMemo(() => {
    const enabled = new Set(settings.enabledProviders);
    let list = providers.filter((p) => enabled.has(p.providerId));
    if (filterIds && filterIds.length > 0) {
      const wanted = new Set(filterIds);
      list = list.filter((p) => wanted.has(p.providerId));
    }
    return [...list].sort(
      (a, b) => maxFloatBarUsedPercent(b) - maxFloatBarUsedPercent(a),
    );
  }, [providers, settings.enabledProviders, filterIds]);

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
    settings.resetTimeRelative,
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
      role="button"
      tabIndex={-1}
      aria-label={t("AppName")}
      className={`floatbar floatbar--${orientation} floatbar--${style}${settings.floatBarDarkText ? " floatbar--light-bg" : ""}`}
      data-tauri-drag-region
      onMouseDown={startDrag}
      style={
        {
          opacity: opacityFraction,
          "--floatbar-scale": scale,
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
              usedSuffix={t("PanelUsedSuffix")}
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
