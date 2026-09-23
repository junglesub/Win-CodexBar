import { act, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom runs with `css: false`, so the battery fill's background comes from
// the stylesheet, not inline styles. Assert the CSS rule directly (same
// pattern as CodexAccountsSection.test.tsx).
if (!import.meta.dirname) {
  throw new Error("import.meta.dirname unavailable to vitest runner");
}
const floatBarCss = readFileSync(`${import.meta.dirname}/FloatBar.css`, "utf8");

function cssRuleBlock(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match).not.toBeNull();
  return match![1];
}

const tauriMocks = vi.hoisted(() => ({
  getCachedProviders: vi.fn(),
  getProviderChartData: vi.fn(),
  getProviderLocalUsageSummary: vi.fn(),
  refreshProviders: vi.fn(),
  refreshProvidersIfStale: vi.fn(),
  getSettingsSnapshot: vi.fn(),
  updateSettings: vi.fn(),
  getLocaleStrings: vi.fn(),
  setUiLanguage: vi.fn(),
}));

const eventMocks = vi.hoisted(() => ({
  listen: vi.fn(),
}));

const windowMocks = vi.hoisted(() => ({
  getCurrentWindow: vi.fn(() => ({
    startDragging: vi.fn().mockResolvedValue(undefined),
  })),
}));

const coreMocks = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/tauri", () => tauriMocks);
vi.mock("@tauri-apps/api/event", () => eventMocks);
vi.mock("@tauri-apps/api/window", () => windowMocks);
vi.mock("@tauri-apps/api/core", () => coreMocks);

import FloatBar from "./FloatBar";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { buildBundle } from "../test/localeHarness";
import type {
  BootstrapState,
  MetricPreference,
  ProviderUsageSnapshot,
  RateWindowSnapshot,
  SettingsSnapshot,
} from "../types/bridge";

type RateWindowOptions = {
  exhausted?: boolean;
  informational?: boolean;
  resetsAt?: string | null;
  resetDescription?: string | null;
  windowMinutes?: number | null;
};

function rateWindow(used: number, opts: RateWindowOptions = {}): RateWindowSnapshot {
  return {
    usedPercent: used,
    remainingPercent: 100 - used,
    windowMinutes: opts.windowMinutes ?? null,
    resetsAt: opts.resetsAt ?? null,
    resetDescription: opts.resetDescription ?? null,
    isExhausted: opts.exhausted ?? false,
    isInformational: opts.informational,
    reservePercent: null,
    reserveDescription: null,
  };
}

function snapshot(
  id: string,
  display: string,
  used: number,
  opts: {
    exhausted?: boolean;
    error?: string | null;
    resetsAt?: string | null;
    resetDescription?: string | null;
    informational?: boolean;
    windowMinutes?: number | null;
    updatedAt?: string;
    primaryLabel?: string;
    primaryWindowMinutes?: number | null;
    secondary?: {
      used: number;
      exhausted?: boolean;
      informational?: boolean;
      resetsAt?: string | null;
      resetDescription?: string | null;
      windowMinutes?: number | null;
    };
    secondaryLabel?: string;
    modelSpecific?: {
      used: number;
      exhausted?: boolean;
      informational?: boolean;
      resetsAt?: string | null;
      resetDescription?: string | null;
      windowMinutes?: number | null;
    } | null;
    tertiary?: {
      used: number;
      exhausted?: boolean;
      informational?: boolean;
      resetsAt?: string | null;
      resetDescription?: string | null;
      windowMinutes?: number | null;
    };
    tertiaryLabel?: string;
  } = {},
): ProviderUsageSnapshot {
  const primary = rateWindow(used, {
    exhausted: opts.exhausted,
    informational: opts.informational,
    resetsAt: opts.resetsAt,
    resetDescription: opts.resetDescription,
    // Common fixture realism: a present primary is a 5-hour window by default,
    // unless the test explicitly supplies a null/other duration.
    windowMinutes:
      opts.primaryWindowMinutes !== undefined
        ? opts.primaryWindowMinutes
        : opts.windowMinutes !== undefined
          ? opts.windowMinutes
          : 300,
  });
  return {
    providerId: id,
    displayName: display,
    primary,
    selectedMetric: primary,
    errorState: "ready",
    primaryLabel: opts.primaryLabel,
    secondary: opts.secondary
      ? rateWindow(opts.secondary.used, {
          ...opts.secondary,
          // Common fixture realism: a present secondary is a weekly window by
          // default, unless the test explicitly supplies a duration.
          windowMinutes:
            opts.secondary.windowMinutes !== undefined
              ? opts.secondary.windowMinutes
              : 10_080,
        })
      : null,
    secondaryLabel: opts.secondaryLabel,
    modelSpecific: opts.modelSpecific
      ? rateWindow(opts.modelSpecific.used, opts.modelSpecific)
      : null,
    tertiary: opts.tertiary ? rateWindow(opts.tertiary.used, opts.tertiary) : null,
    tertiaryLabel: opts.tertiaryLabel,
    extraRateWindows: [],
    cost: null,
    planName: null,
    accountEmail: null,
    sourceLabel: "auto",
    updatedAt: opts.updatedAt ?? "2026-05-15T00:00:00Z",
    error: opts.error ?? null,
    pace: null,
    accountOrganization: null,
    trayStatusLabel: null,
  };
}

function settings(overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  return {
    enabledProviders: ["claude", "codex"],
    refreshIntervalSecs: 300,
    adaptiveRefresh: false,
    refreshAllProvidersOnMenuOpen: false,
  lowPowerMode: false,
    startAtLogin: false,
    startMinimized: false,
    showNotifications: true,
    soundEnabled: true,
    notificationSoundTheme: "windows",
    notificationSoundPaths: {
      predictiveWarning: null,
      highUsage: null,
      criticalUsage: null,
      exhausted: null,
      statusIssue: null,
      sessionDepleted: null,
      sessionRestored: null,
    },
    highUsageThreshold: 70,
    criticalUsageThreshold: 90,
    predictivePaceWarningEnabled: false,
    trayIconMode: "single",
    switcherShowsIcons: true,
    menuBarShowsHighestUsage: false,
    menuBarShowsPercent: false,
    showAsUsed: true,
    floatBarBatteryStyle: false,
    floatBarBatterySlots: [],
    floatBarShowRemaining: false,
    showAllTokenAccountsInMenu: false,
    enableAnimations: true,
    resetTimeRelative: true,
    showResetWhenExhausted: false,
    menuBarDisplayMode: "detailed",
    hidePersonalInfo: false,
    updateChannel: "stable",
    autoDownloadUpdates: false,
    installUpdatesOnQuit: false,
    globalShortcut: "Ctrl+Shift+U",
    codexCustomSessionsDirs: [],
    uiLanguage: "english",
    theme: "dark",
    windowScalePercent: 125,
    trayScalePercent: 100,
    powertoysStatusPipeEnabled: false,
    claudeAvoidKeychainPrompts: false,
    codexSparkUsageVisible: true,
    disableKeychainAccess: false,
    providerMetrics: {},
    floatBarEnabled: true,
    floatBarOpacity: 80,
    floatBarBackgroundColor: "#FFFFFF",
    floatBarBackgroundOpacity: 8,
    floatBarScale: 100,
    floatBarOrientation: "horizontal",
    floatBarStyle: "floating",
    floatBarClickThrough: false,
    floatBarProviderIds: [],
    floatBarDarkText: false,
    floatBarShowResetInline: false,
    floatBarHidePercentWhenExhausted: false,
    floatBarExhaustedClockTime: false,
    floatBarExhaustedWeekdayTime: false,
    floatBarShowCost: false,
    claudeDailyRoutinesUsageVisible: true,
    alibabaTokenPlanRegion: "cn",
    weeklyProgressWorkDays: null,
    ...overrides,
  } as SettingsSnapshot;
}

function bootstrap(settingsOverrides: Partial<SettingsSnapshot> = {}): BootstrapState {
  return {
    contractVersion: "v1",
    providers: [],
    settings: settings(settingsOverrides),
  };
}

function renderFloatBar(state: BootstrapState) {
  return render(
    <LocaleProvider>
      <FloatBar state={state} />
    </LocaleProvider>,
  );
}

/** The exact error text emitted by the Rust Antigravity provider probe. */
const AGY_NOT_RUNNING_ERROR =
  "Antigravity language server not running. Start Google Antigravity and sign in, then retry.";

describe("FloatBar", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.refreshProviders.mockResolvedValue(undefined);
    tauriMocks.refreshProvidersIfStale.mockResolvedValue(undefined);
    tauriMocks.getProviderLocalUsageSummary.mockResolvedValue(null);
    tauriMocks.getLocaleStrings.mockResolvedValue(
      buildBundle({
        ResetsInMinutes: "Resets in {}m",
        ResetsInHoursMinutes: "Resets in {}h {}m",
        ResetsInDaysHours: "Resets in {}d {}h",
        TrayResetsDueNow: "Resetting",
        LastUpdated: "Updated",
        UpdatedJustNow: "Updated just now",
        UpdatedMinutesAgo: "{} minutes ago",
        UpdatedHoursAgo: "{} hours ago",
        UpdatedDaysAgo: "{} days ago",
        PanelToday: "Today",
        PanelUsedSuffix: "used",
        PanelFiveHours: "5h",
        ProviderWeeklyLabel: "Weekly",
        FloatBarBatterySlotMonthly: "Monthly",
        DetailPaceAhead: "Ahead",
        DetailPaceBehind: "Behind",
        DetailPaceOnTrack: "On track",
        DetailPaceRunsOutIn: "Runs out in",
        DetailPaceWillLastToReset: "Will last to reset",
        DetailPaceElapsed: "{} elapsed",
        DetailPaceResetRemaining: "reset remaining {}",
        FloatBarThirtyDayShort: "30d",
        FloatBarNoProviders: "No providers",
        FloatBarRemainingSuffix: "remaining",
        FloatBarAgyRunNeeded: "Start agy",
      }),
    );
    eventMocks.listen.mockResolvedValue(() => {});
  });

  it("renders a pill per enabled provider, sorted by usage descending", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 20),
      snapshot("codex", "Codex", 75),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarShowCost: true }),
    );

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      const pills = container.querySelectorAll(".floatbar__pill");
      expect(pills.length).toBe(2);
    });

    const titles = Array.from(container.querySelectorAll(".floatbar__pill")).map(
      (el) => el.getAttribute("title") ?? "",
    );
    // Highest used (codex, 75%) shows first; pill carries full slot detail.
    expect(titles[0]).toMatch(/Codex: 5h: 75% used\nUpdated/);
    expect(titles[1]).toMatch(/Claude: 5h: 20% used\nUpdated/);
  });

  it("exposes the float bar and each provider pill as named semantic groups", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 20),
      snapshot("codex", "Codex", 75),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    renderFloatBar(bootstrap());

    // The outer bar is a group named by the app label, not a button.
    const bar = await screen.findByRole("group", { name: "AppName" });
    expect(bar).not.toBeNull();
    expect(screen.queryByRole("button", { name: "AppName" })).toBeNull();

    // Each provider pill is a semantically exposed named group.
    await waitFor(() => {
      const codex = screen.getByRole("group", {
        name: /Codex: 5h: 75% used\nUpdated/,
      });
      const claude = screen.getByRole("group", {
        name: /Claude: 5h: 20% used\nUpdated/,
      });
      expect(codex).not.toBeNull();
      expect(claude).not.toBeNull();
    });
  });

  // A cadence-less provider: every canonical window has no recognizable
  // cadence, so the three fixed slots stay empty and the fallback applies.
  // Defaults supply non-cadence windows; pass explicit null to omit one.
  function cadenceless(
    id: string,
    display: string,
    opts: Parameters<typeof snapshot>[3] = {},
  ) {
    const defaults: Parameters<typeof snapshot>[3] = {
      primaryWindowMinutes: null,
      secondary: { used: 35, windowMinutes: null },
      modelSpecific: { used: 55, windowMinutes: null },
      tertiary: { used: 12, windowMinutes: null },
    };
    return snapshot(id, display, 10, {
      ...defaults,
      ...opts,
      primaryWindowMinutes:
        opts.primaryWindowMinutes !== undefined
          ? opts.primaryWindowMinutes
          : defaults.primaryWindowMinutes,
      secondary: opts.secondary !== undefined ? opts.secondary : defaults.secondary,
      modelSpecific: opts.modelSpecific !== undefined ? opts.modelSpecific : defaults.modelSpecific,
      tertiary: opts.tertiary !== undefined ? opts.tertiary : defaults.tertiary,
    });
  }

  it.each([
    ["automatic", undefined, "55%", /Model/],
    ["session", "session", "10%", /Session/],
    ["weekly", "weekly", "35%", /Weekly/],
    ["model", "model", "55%", /Model/],
    ["unsupported", "credits", "55%", /Model/],
  ] as const)(
    "shows the %s fallback metric for a cadence-less provider",
    async (_prefName, preference, expectedValue, expectedLabel) => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        cadenceless("antigravity", "Antigravity"),
      ]);
      const providerMetrics: Record<string, MetricPreference> = preference
        ? { antigravity: preference }
        : {};
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ enabledProviders: ["antigravity"], providerMetrics }),
      );

      const { container } = renderFloatBar(
        bootstrap({ enabledProviders: ["antigravity"], providerMetrics }),
      );
      await waitFor(() => {
        const metrics = Array.from(
          container.querySelectorAll(".floatbar__metric"),
          (node) => node.textContent,
        );
        expect(metrics.some((text) => text?.includes(expectedValue))).toBe(true);
        expect(metrics.some((text) => expectedLabel.test(text ?? ""))).toBe(true);
      });
    },
  );

  it.each([
    ["absent", null, "10%"],
    ["informational", { used: 55, windowMinutes: null, informational: true }, "10%"],
  ] as const)(
    "falls back to the automatic order when the requested %s window is unavailable",
    async (_kind, modelOverride, expectedValue) => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        cadenceless("antigravity", "Antigravity", {
          modelSpecific: modelOverride as never,
        }),
      ]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({
          enabledProviders: ["antigravity"],
          providerMetrics: { antigravity: "model" },
        }),
      );

      const { container } = renderFloatBar(
        bootstrap({
          enabledProviders: ["antigravity"],
          providerMetrics: { antigravity: "model" },
        }),
      );
      await waitFor(() => {
        const metrics = Array.from(
          container.querySelectorAll(".floatbar__metric"),
          (node) => node.textContent,
        );
        // modelSpecific unavailable -> automatic picks primary (10%).
        expect(metrics.some((text) => text?.includes(expectedValue))).toBe(true);
      });
    },
  );

  it("prefers provider.primaryLabel for the session fallback label", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      cadenceless("claude", "Claude", { primaryLabel: "Claude" }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({
        enabledProviders: ["claude"],
        providerMetrics: { claude: "session" },
      }),
    );

    const { container } = renderFloatBar(
      bootstrap({
        enabledProviders: ["claude"],
        providerMetrics: { claude: "session" },
      }),
    );
    await waitFor(() => {
      const pill = container.querySelector(".floatbar__pill");
      expect(pill?.getAttribute("aria-label")).toContain("Claude: Claude: 10% used");
      // The generic "Session" label is NOT used.
      expect(pill?.getAttribute("aria-label")).not.toContain("ProviderSessionLabel");
    });
  });

  it("prefers provider.secondaryLabel for the weekly fallback label", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      cadenceless("gemini", "Gemini", { secondaryLabel: "Gemini Pro" }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({
        enabledProviders: ["gemini"],
        providerMetrics: { gemini: "weekly" },
      }),
    );

    const { container } = renderFloatBar(
      bootstrap({
        enabledProviders: ["gemini"],
        providerMetrics: { gemini: "weekly" },
      }),
    );
    await waitFor(() => {
      const pill = container.querySelector(".floatbar__pill");
      expect(pill?.getAttribute("aria-label")).toContain("Gemini: Gemini Pro: 35% used");
      // The generic "Weekly" label is NOT used.
      expect(pill?.getAttribute("aria-label")).not.toContain("ProviderWeeklyLabel");
    });
  });

  it("ignores the preference when a provider has recognized cadences", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 23, {
        primaryWindowMinutes: 300,
        secondary: { used: 41, windowMinutes: 10_080 },
        tertiary: { used: 8, windowMinutes: 43_200 },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ providerMetrics: { claude: "model" } }),
    );

    const { container } = renderFloatBar(bootstrap({ providerMetrics: { claude: "model" } }));
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["23%", "41%", "8%"]);
    });
  });

  it("uses the fallback window for sorting and tone", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      cadenceless("antigravity", "Antigravity"),
      snapshot("claude", "Claude", 60),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ enabledProviders: ["antigravity", "claude"] }),
    );

    const { container } = renderFloatBar(
      bootstrap({ enabledProviders: ["antigravity", "claude"] }),
    );
    await waitFor(() => {
      const titles = Array.from(container.querySelectorAll(".floatbar__pill")).map(
        (pill) => pill.getAttribute("title"),
      );
      // antigravity peaks at 55% (modelSpecific) -> sorts below claude 60%.
      expect(titles[0]).toMatch(/Claude/);
      expect(titles[1]).toMatch(/Antigravity/);
    });
  });

  it("shows a fallback dash and critical tone on provider error", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      cadenceless("antigravity", "Antigravity", { error: "boom" }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ enabledProviders: ["antigravity"] }),
    );

    const { container } = renderFloatBar(bootstrap({ enabledProviders: ["antigravity"] }));
    await waitFor(() => {
      const metrics = Array.from(
        container.querySelectorAll(".floatbar__metric"),
        (node) => node.textContent,
      );
      expect(metrics.some((text) => text?.includes("—"))).toBe(true);
      // The pill stays neutral; the displayed fallback dash metric is critical.
      expect(container.querySelector(".floatbar__pill")?.className).toBe("floatbar__pill");
      expect(container.querySelector(".floatbar__metric--crit")).not.toBeNull();
      // Pill detail must preserve the actual provider error and not show stale percentages or fallback identity.
      expect(container.querySelector(".floatbar__pill")?.getAttribute("aria-label")).toMatch(
        /^Antigravity: boom\nUpdated: /,
      );
    });
  });

  it("shows the compact agy-run overlay for the antigravity not-running error", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      // Realistic error snapshot from ProviderUsageSnapshot::from_error with
      // the legacy Antigravity primaryLabel "Claude" populated.
      snapshot("antigravity", "Antigravity", 0, {
        error: AGY_NOT_RUNNING_ERROR,
        primaryLabel: "Claude",
        primaryWindowMinutes: null,
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ enabledProviders: ["antigravity"] }),
    );

    const { container } = renderFloatBar(
      bootstrap({ enabledProviders: ["antigravity"] }),
    );
    await waitFor(() => {
      const metrics = Array.from(
        container.querySelectorAll(".floatbar__metric"),
        (node) => node.textContent,
      );
      // One compact visible overlay message next to the Antigravity icon.
      expect(metrics).toEqual(["Start agy"]);
    });
    // No visible Claude identity anywhere in the pill.
    expect(container.querySelector(".floatbar__pill")?.textContent).not.toContain("Claude");
    // The pill's hover/accessibility detail preserves the error state without
    // showing the legacy Claude primaryLabel identity.
    const label = container.querySelector(".floatbar__pill")?.getAttribute("aria-label") ?? "";
    expect(label).toContain(`Antigravity: ${AGY_NOT_RUNNING_ERROR}`);
    expect(label).not.toContain("Claude");
    expect(label).not.toContain("Start agy");
  });

  it("keeps unrelated provider errors as dashes without the agy overlay", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("codex", "Codex", 0, {
        error: "Some unrelated codex error",
        primaryWindowMinutes: null,
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ enabledProviders: ["codex"] }),
    );

    const { container } = renderFloatBar(
      bootstrap({ enabledProviders: ["codex"] }),
    );
    await waitFor(() => {
      // Unrelated errors keep the existing dash behavior — no overlay text.
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["—"]);
    });
    const pill = container.querySelector(".floatbar__pill");
    expect(pill?.textContent).not.toContain("Start agy");
    // The actual provider error is preserved in the detail.
    expect(pill?.getAttribute("aria-label")).toContain("Codex: Some unrelated codex error");
    // No identity leak in the detail either.
    expect(pill?.getAttribute("aria-label")).not.toContain("Claude");
  });

  it("keeps normal Antigravity Claude/Gemini labels unchanged without an error", async () => {
    // Cadence-less fallback path with the legacy session label, mirroring the
    // existing `prefers provider.primaryLabel for the session fallback label`
    // coverage — the visible "Claude" label must survive when there is no error.
    tauriMocks.getCachedProviders.mockResolvedValue([
      cadenceless("antigravity", "Antigravity", { primaryLabel: "Claude" }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({
        enabledProviders: ["antigravity"],
        providerMetrics: { antigravity: "session" },
      }),
    );

    const { container } = renderFloatBar(
      bootstrap({
        enabledProviders: ["antigravity"],
        providerMetrics: { antigravity: "session" },
      }),
    );
    await waitFor(() => {
      const metrics = Array.from(
        container.querySelectorAll(".floatbar__metric"),
        (node) => node.textContent,
      );
      // Visible Claude label + 10% value, no overlay.
      expect(metrics.some((text) => text?.includes("Claude 10%"))).toBe(true);
    });
    const pill = container.querySelector(".floatbar__pill");
    expect(pill?.textContent).not.toContain("Start agy");
    expect(pill?.getAttribute("aria-label")).toContain("Antigravity: Claude: 10% used");
  });

  it("renders a locale-independent inline reset on the fallback metric", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
    tauriMocks.getCachedProviders.mockResolvedValue([
      cadenceless("antigravity", "Antigravity", {
        modelSpecific: { used: 55, windowMinutes: null, resetsAt: "2026-08-18T02:05:00Z" },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({
        enabledProviders: ["antigravity"],
        floatBarShowResetInline: true,
      }),
    );

    const { container } = renderFloatBar(
      bootstrap({ enabledProviders: ["antigravity"], floatBarShowResetInline: true }),
    );
    await act(async () => vi.runOnlyPendingTimersAsync());

    const metrics = Array.from(
      container.querySelectorAll(".floatbar__metric"),
      (node) => node.textContent,
    );
    // 2h 5m future reset appends its single largest unit.
    expect(metrics.some((text) => text?.includes("2h"))).toBe(true);
    expect(metrics.some((text) => text?.includes("2h 5m"))).toBe(false);
  });

  it("exposes the labeled fallback metric in the pill accessible name", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([cadenceless("antigravity", "Antigravity")]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ enabledProviders: ["antigravity"] }),
    );

    renderFloatBar(bootstrap({ enabledProviders: ["antigravity"] }));

    await waitFor(() => {
      const pill = screen.getByRole("group", {
        name: /Antigravity: DetailWindowModelSpecific: 55% used/,
      });
      expect(pill).not.toBeNull();
    });
  });

  it("renders canonical 5h, weekly, and monthly windows in fixed order", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 23, {
        primaryWindowMinutes: 300,
        secondary: { used: 41, windowMinutes: 10_080 },
        tertiary: { used: 8, windowMinutes: 43_200 },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["23%", "41%", "8%"]);
    });
  });

  it.each([
    ["28 days", 40_320],
    ["29 days", 41_760],
    ["30 days", 43_200],
    ["31 days", 44_640],
  ])("classifies a %s window as monthly", async (_label, windowMinutes) => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, {
        informational: true,
        tertiary: { used: 8, windowMinutes },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["8%"]);
    });
  });

  it("classifies a window just below 28 days as weekly, not monthly", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, {
        informational: true,
        secondary: { used: 41, windowMinutes: 40_319 },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["41%"]);
    });
  });

  it("classifies Grok weekly quota as weekly (slot 'w') instead of monthly", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("grok", "Grok", 35, {
        primaryLabel: "Weekly",
        primaryWindowMinutes: 10_080,
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings({ enabledProviders: ["grok"] }));

    const { container } = renderFloatBar(bootstrap({ enabledProviders: ["grok"] }));
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["35%"]);
    });
  });

  it("classifies Grok weekly quota as weekly by label when windowMinutes is absent", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("grok", "Grok", 35, {
        primaryLabel: "Weekly",
        primaryWindowMinutes: null,
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings({ enabledProviders: ["grok"] }));

    const { container } = renderFloatBar(bootstrap({ enabledProviders: ["grok"] }));
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["35%"]);
    });
  });

  it("does not classify a window above 31 days as monthly", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, {
        primaryWindowMinutes: 300,
        secondary: { used: 41, windowMinutes: 10_080 },
        tertiary: { used: 8, windowMinutes: 44_641 },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["10%", "41%"]);
    });
  });

  it("drops missing and informational lanes, keeping only quota lanes", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, {
        informational: true,
        primaryWindowMinutes: 300,
        secondary: { used: 41, windowMinutes: 10_080 },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["41%"]);
    });
  });

  it("classifies a monthly window from a label when duration is absent", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, {
        primaryWindowMinutes: 300,
        secondary: { used: 41, windowMinutes: 10_080 },
        tertiary: { used: 8 },
        tertiaryLabel: "Monthly",
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["10%", "41%", "8%"]);
    });
  });

  it.each(["5h", "5-hour", "5 hour", "5-Hour"])(
    "classifies a 5-hour window from the label %s when duration is absent",
    async (label) => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        snapshot("claude", "Claude", 10, {
          informational: true,
          secondary: { used: 41 },
          tertiary: { used: 8 },
          tertiaryLabel: label,
        }),
      ]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

      const { container } = renderFloatBar(bootstrap());
      await waitFor(() => {
        expect(
          Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
        ).toEqual(["8%", "41%"]);
      });
    },
  );

  it("refuses label fallback for an unsupported known duration", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, {
        primaryWindowMinutes: 300,
        secondary: { used: 41, windowMinutes: 10_080 },
        tertiary: { used: 8, windowMinutes: 60 },
        tertiaryLabel: "Monthly",
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["10%", "41%"]);
    });
  });

  it("keeps the first match when duplicate cadence candidates exist", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      // Two canonical windows both resolve to the 5-hour cadence; the earlier
      // (primary) candidate must win so its used value is the one rendered.
      snapshot("claude", "Claude", 10, {
        primaryWindowMinutes: 300,
        secondary: { used: 41, windowMinutes: 300 },
        tertiary: { used: 90, windowMinutes: 43_200 },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["10%", "90%"]);
    });
  });

  it("renders three dashes for provider errors even with future resets and inline mode", async () => {
    const resetsAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, {
        error: "boom",
        resetsAt,
        primaryWindowMinutes: 300,
        secondary: { used: 41, windowMinutes: 10_080, resetsAt },
        tertiary: { used: 8, windowMinutes: 43_200, resetsAt },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarShowResetInline: true }),
    );

    const { container } = renderFloatBar(bootstrap({ floatBarShowResetInline: true }));
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["—", "—", "—"]);
      // The pill stays neutral; every displayed error dash metric is critical.
      expect(container.querySelector(".floatbar__pill")?.className).toBe("floatbar__pill");
      expect(container.querySelectorAll(".floatbar__metric--crit").length).toBe(3);
      // The pill detail must show the error detail, not stale percentages.
      expect(container.querySelector(".floatbar__pill")?.getAttribute("aria-label")).toMatch(
        /^Claude: boom\nUpdated: /,
      );
    });
  });

  it("sorts and tones by the highest recognized used percentage", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 75, {
        primaryWindowMinutes: 300,
        secondary: { used: 20, windowMinutes: 10_080 },
      }),
      snapshot("codex", "Codex", 40, {
        primaryWindowMinutes: 300,
        secondary: { used: 80, windowMinutes: 10_080 },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      const titles = Array.from(container.querySelectorAll(".floatbar__pill")).map(
        (pill) => pill.getAttribute("title"),
      );
      // codex peaks at 80% (warn); claude peaks at 75% (warn) → codex first.
      expect(titles[0]).toMatch(/Codex/);
      expect(titles[1]).toMatch(/Claude/);
      // Each metric colors itself: 75% and 80% are warn, 40% and 20% neutral;
      // the pills themselves stay neutral.
      expect(container.querySelectorAll(".floatbar__metric--warn").length).toBe(2);
      expect(container.querySelectorAll(".floatbar__pill--warn").length).toBe(0);
      expect(container.querySelectorAll(".floatbar__pill").length).toBe(2);
    });
  });

  it("keeps a normal primary window when a secondary window is available", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 20, { secondary: { used: 90 } }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      // primary defaults to 5h; secondary defaults to weekly.
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["20%", "90%"]);
    });
  });

  it("uses a real secondary window when the primary window is informational", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, {
        informational: true,
        secondary: {
          used: 80,
          resetsAt: null,
          resetDescription: "Resets in 2 hours",
        },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarShowResetInline: true }),
    );

    const { container } = renderFloatBar(bootstrap({ floatBarShowResetInline: true }));
    await waitFor(() => {
      // informational primary is treated as absent; weekly secondary shows.
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["80%"]);
      // The pill stays neutral; the weekly 80% metric is warn.
      expect(container.querySelector(".floatbar__pill")?.className).toBe("floatbar__pill");
      expect(container.querySelectorAll(".floatbar__metric--warn").length).toBe(1);
      // resetDescription alone is not enough for an inline countdown; the
      // pill accessibility detail still carries the weekly used percentage.
      expect(container.querySelector(".floatbar__pill")?.getAttribute("aria-label")).toMatch(
        /weekly: 80% used/,
      );
    });
  });

  it("drops an informational-only primary with no usable secondary", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, { informational: true }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(container.querySelector(".floatbar__pill")).not.toBeNull();
    });
    expect(container.querySelectorAll(".floatbar__metric")).toHaveLength(0);
    expect(
      container.querySelector(".floatbar__pill")?.getAttribute("title"),
    ).not.toMatch(/5h:|weekly:|monthly:/);
  });

  it("drops informational lanes when every lane is informational", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, { informational: true }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(container.querySelector(".floatbar__pill")).not.toBeNull();
    });
    expect(container.querySelectorAll(".floatbar__metric")).toHaveLength(0);
  });

  it("drops informational lanes when primary and secondary are informational", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, {
        informational: true,
        secondary: { used: 90, informational: true },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(container.querySelector(".floatbar__pill")).not.toBeNull();
    });
    expect(container.querySelectorAll(".floatbar__metric")).toHaveLength(0);
  });

  it("drops quota-less lanes entirely instead of showing dashes", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 20, {
        primaryWindowMinutes: 300,
        secondary: { used: 41, windowMinutes: 10_080 },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["20%", "41%"]);
    });
    // One separator between the two remaining lanes; no monthly anywhere.
    expect(container.querySelectorAll(".floatbar__metric-separator")).toHaveLength(1);
    const title = container.querySelector(".floatbar__pill")?.getAttribute("title") ?? "";
    expect(title).toMatch(/^Claude: 5h: 20% used\nweekly: 41% used\nUpdated/);
    expect(title).not.toContain("monthly");
  });

  it("sorts providers by their effective rate window", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 90, {
        informational: true,
        secondary: { used: 20 },
      }),
      snapshot("codex", "Codex", 50),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      // claude's informational primary is absent → max used is 20 (weekly);
      // codex primary 5h 50% sorts first. Assert only the slot portion so
      // the relative last-updated line stays out of this test's scope.
      const titles = Array.from(container.querySelectorAll(".floatbar__pill")).map(
        (pill) => pill.getAttribute("title"),
      );
      expect(titles[0]).toMatch(/^Codex: 5h: 50% used\nUpdated/);
      expect(titles[1]).toMatch(/^Claude: weekly: 20% used\nUpdated/);
    });
  });

  it("loads local cost summaries without using the foreground chart endpoint", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("codex", "Codex", 75),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());
    tauriMocks.getProviderLocalUsageSummary.mockResolvedValue({
      todayCost: 1.25,
      thirtyDayCost: 12.5,
      thirtyDayTokens: 1000,
      latestTokens: 200,
      topModel: "gpt-5",
      estimateNote: "Estimated from local logs",
      tokenCostUpdatedAtMs: 1234,
    });

    renderFloatBar(bootstrap({ floatBarShowCost: true }));

    await waitFor(() => {
      expect(tauriMocks.getProviderLocalUsageSummary).toHaveBeenCalledWith("codex");
    });
    expect(tauriMocks.getProviderChartData).not.toHaveBeenCalled();
  });

  it("does not scan local costs by default", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("codex", "Codex", 75),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    renderFloatBar(bootstrap());

    await waitFor(() => {
      expect(tauriMocks.getCachedProviders).toHaveBeenCalled();
    });
    expect(tauriMocks.getProviderLocalUsageSummary).not.toHaveBeenCalled();
  });

  it("ignores showAsUsed and always renders consumed percentages", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 20),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings({ showAsUsed: false }));

    const { container } = renderFloatBar(bootstrap({ showAsUsed: false }));

    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["20%"]);
    });
  });

  it("applies warning tone when remaining drops below the high threshold", async () => {
    // highUsageThreshold = 70 → high-remaining cutoff = 30%.
    // claude at 80% used → 20% remaining → critical (also below crit cutoff 10).
    // Use 75% used → 25% remaining → warn (between 10 and 30).
    tauriMocks.getCachedProviders.mockResolvedValue([snapshot("claude", "Claude", 75)]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      // The pill stays neutral; the 75% used metric itself is warn.
      expect(container.querySelector(".floatbar__pill")?.className).toBe("floatbar__pill");
      expect(container.querySelector(".floatbar__metric--warn")).not.toBeNull();
    });
  });

  it("applies critical tone when the provider is exhausted", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 100, { exhausted: true }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      // The pill stays neutral; the exhausted 100% used metric itself is critical.
      expect(container.querySelector(".floatbar__pill")?.className).toBe("floatbar__pill");
      expect(container.querySelector(".floatbar__metric--crit")).not.toBeNull();
    });
  });

  it("filters to the floatBarProviderIds allowlist when non-empty", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 30),
      snapshot("codex", "Codex", 50),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarProviderIds: ["codex"] }),
    );

    const { container } = renderFloatBar(
      bootstrap({ floatBarProviderIds: ["codex"] }),
    );
    await waitFor(() => {
      const pills = container.querySelectorAll(".floatbar__pill");
      expect(pills.length).toBe(1);
      expect(pills[0].getAttribute("title")).toMatch(/Codex/);
    });
  });

  it("does not show stale cached providers when all providers are disabled", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 30),
      snapshot("codex", "Codex", 50),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ enabledProviders: [] }),
    );

    const { container } = renderFloatBar(bootstrap({ enabledProviders: [] }));
    await waitFor(() => {
      expect(container.querySelectorAll(".floatbar__pill").length).toBe(0);
      expect(container.querySelector(".floatbar__empty")).not.toBeNull();
    });
  });

  it("shows an empty state when no providers match", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(container.querySelector(".floatbar__empty")).not.toBeNull();
    });
  });

  it("applies the light-background class and CSS opacity", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarDarkText: true, floatBarOpacity: 45 }),
    );

    const { container } = renderFloatBar(
      bootstrap({ floatBarDarkText: true, floatBarOpacity: 45 }),
    );

    await waitFor(() => {
      const bar = container.querySelector<HTMLElement>(".floatbar");
      expect(bar).not.toBeNull();
      expect(bar?.classList.contains("floatbar--light-bg")).toBe(true);
      expect(bar?.style.opacity).toBe("0.45");
    });
  });

  it("applies the configured scale as a CSS variable", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings({ floatBarScale: 150 }));

    const { container } = renderFloatBar(bootstrap({ floatBarScale: 150 }));

    await waitFor(() => {
      const bar = container.querySelector<HTMLElement>(".floatbar");
      expect(bar).not.toBeNull();
      expect(bar?.style.getPropertyValue("--floatbar-scale")).toBe("1.5");
    });
  });

  it("applies the custom pill background as CSS variables and live-updates", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarBackgroundColor: "#123456", floatBarBackgroundOpacity: 37 }),
    );

    const { container } = renderFloatBar(
      bootstrap({ floatBarBackgroundColor: "#123456", floatBarBackgroundOpacity: 37 }),
    );

    await waitFor(() => {
      const bar = container.querySelector<HTMLElement>(".floatbar");
      expect(bar).not.toBeNull();
      expect(bar?.style.getPropertyValue("--floatbar-background-color")).toBe("#123456");
      expect(bar?.style.getPropertyValue("--floatbar-background-opacity")).toBe("37%");
    });

    // A settings patch broadcasts `float-bar-config-changed`; the open surface
    // re-reads the snapshot and updates without recreating its window.
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarBackgroundColor: "#ABCDEF", floatBarBackgroundOpacity: 65 }),
    );
    const configHandler = eventMocks.listen.mock.calls.find(
      ([name]) => name === "float-bar-config-changed",
    )?.[1] as () => void;
    await act(async () => {
      configHandler?.();
    });

    await waitFor(() => {
      const bar = container.querySelector<HTMLElement>(".floatbar");
      expect(bar?.style.getPropertyValue("--floatbar-background-color")).toBe("#ABCDEF");
      expect(bar?.style.getPropertyValue("--floatbar-background-opacity")).toBe("65%");
    });
  });

  it("resizes the native window in physical pixels at the WebView DPI", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());
    const originalDevicePixelRatio = window.devicePixelRatio;
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 1.5,
    });
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        x: 0,
        y: 0,
        width: 100,
        height: 20,
        top: 0,
        right: 100,
        bottom: 20,
        left: 0,
        toJSON: () => ({}),
      });

    try {
      renderFloatBar(bootstrap());

      await waitFor(() => {
        expect(coreMocks.invoke).toHaveBeenCalledWith("resize_float_bar", {
          width: 162,
          height: 42,
        });
      });
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        value: originalDevicePixelRatio,
      });
    }
  });

  it("appends each reset using only its largest time unit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 100, {
        resetsAt: "2026-08-18T00:30:00Z",
        primaryWindowMinutes: 300,
        secondary: {
          used: 41,
          windowMinutes: 10_080,
          resetsAt: "2026-08-18T01:30:00Z",
        },
        tertiary: {
          used: 60,
          windowMinutes: 43_200,
          resetsAt: "2026-08-19T12:00:00Z",
        },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarShowResetInline: true }),
    );

    const { container } = renderFloatBar(
      bootstrap({ floatBarShowResetInline: true }),
    );
    await act(async () => vi.runOnlyPendingTimersAsync());

    // Every eligible slot keeps its percentage and shows one largest unit.
    expect(
      Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
    ).toEqual(["100% 30m", "41% 1h", "60% 1d"]);
    // The pill accessibility detail retains cadence, used percentage, and the
    // localized reset for each slot.
    const pillLabel = container.querySelector(".floatbar__pill")?.getAttribute("aria-label");
    expect(pillLabel).toMatch(/5h: 100% used\nResets in 30m/);
    expect(pillLabel).toMatch(/weekly: 41% used\nResets in 1h 30m/);
    expect(pillLabel).toMatch(/monthly: 60% used\nResets in 1d 12h/);
  });

  it("keeps the visible countdown locale-independent under a non-English locale", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 100, {
        resetsAt: "2026-08-18T02:05:00Z",
        primaryWindowMinutes: 300,
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarShowResetInline: true }),
    );
    tauriMocks.getLocaleStrings.mockResolvedValue(
      buildBundle(
        {
          ResetsInHoursMinutes: "リセットまで {}時間 {}分",
          ResetsInDaysHours: "リセットまで {}日 {}時間",
          TrayResetsDueNow: "リセット中",
          PanelUsedSuffix: "使用済み",
        },
        "japanese",
      ),
    );

    const { container } = renderFloatBar(bootstrap({ floatBarShowResetInline: true }));
    await act(async () => vi.runOnlyPendingTimersAsync());

    // The visible value is the compact locale-independent countdown, never
    // English-stripped or localized prose.
    expect(
      Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
    ).toEqual(["100% 2h"]);
    // The tooltip/accessibility keeps the localized prose.
    expect(container.querySelector(".floatbar__pill")?.getAttribute("aria-label")).toMatch(
      /5h: 100% 使用済み\nリセットまで 2時間 5分/,
    );
  });

  it("appends a localized relative last-updated line to every pill detail", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
    tauriMocks.getCachedProviders.mockResolvedValue([
      // Provider A: parseable past updatedAt → localized relative text that
      // advances on the shared 30-second clock even with no reset timestamp.
      snapshot("claude", "Claude", 20, {
        updatedAt: "2026-08-17T23:54:00Z",
        primaryWindowMinutes: 300,
        secondary: { used: 41, windowMinutes: 10_080 },
      }),
      // Provider B: unparseable updatedAt → raw value preserved after label.
      // Codex (50% used) sorts before Claude (max 41% weekly).
      snapshot("codex", "Codex", 50, {
        updatedAt: "unknown-source-time",
        primaryWindowMinutes: 300,
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await act(async () => vi.runOnlyPendingTimersAsync());

    const pills = Array.from(container.querySelectorAll(".floatbar__pill"));
    expect(pills.length).toBe(2);
    const codexLabel = pills[0].getAttribute("aria-label");
    const claudeLabel = pills[1].getAttribute("aria-label");
    // Title and aria-label stay identical for every pill.
    expect(pills[0].getAttribute("title")).toBe(codexLabel);
    expect(pills[1].getAttribute("title")).toBe(claudeLabel);
    // Unparseable updatedAt keeps its raw value after the localized label.
    expect(codexLabel).toMatch(
      /^Codex: 5h: 50% used\nUpdated: unknown-source-time$/,
    );
    // Relative text is localized and appended after the full slot detail.
    expect(claudeLabel).toMatch(
      /^Claude: 5h: 20% used\nweekly: 41% used\nUpdated: 6 minutes ago$/,
    );

    // The shared 30-second clock advances relative text even though neither
    // provider has a reset timestamp; crossing a minute boundary updates it.
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(pills[1].getAttribute("aria-label")).toMatch(/Updated: 7 minutes ago/);
  });

  it("keeps percentages visible when inline resets are disabled", async () => {
    const resetsAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 20, { resetsAt }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());

    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["20%"]);
      // The pill tooltip/accessibility retains the localized reset text.
      expect(container.querySelector(".floatbar__pill")?.getAttribute("aria-label")).toMatch(
        /5h: 20% used\nResets in [12]h/,
      );
    });
  });

  it("leaves expired or invalid timestamps as percentages", async () => {
    const expired = new Date(Date.now() - 60_000).toISOString();
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 20, {
        resetsAt: expired,
        secondary: { used: 41, resetsAt: "not-a-date" },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarShowResetInline: true }),
    );

    const { container } = renderFloatBar(bootstrap({ floatBarShowResetInline: true }));

    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["20%", "41%"]);
    });
  });

  it("shows only the detailed remaining time for exhausted slots when hide-percent is on", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 100, {
        exhausted: true,
        // 4d 12h in the future → detailed form, not the single-unit `4d`.
        resetsAt: "2026-08-22T12:00:00Z",
        primaryWindowMinutes: 300,
        secondary: {
          used: 100,
          exhausted: true,
          windowMinutes: 10_080,
          resetsAt: "2026-08-18T03:12:00Z",
        },
        tertiary: {
          used: 60,
          windowMinutes: 43_200,
          resetsAt: "2026-08-19T12:00:00Z",
        },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarHidePercentWhenExhausted: true }),
    );

    const { container } = renderFloatBar(
      bootstrap({ floatBarHidePercentWhenExhausted: true }),
    );
    await act(async () => vi.runOnlyPendingTimersAsync());

    expect(
      Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
    ).toEqual(["4d 12h", "3h 12m", "60%"]);
    // Tooltip/accessibility keeps the full percentage detail.
    const pillLabel = container.querySelector(".floatbar__pill")?.getAttribute("aria-label");
    expect(pillLabel).toMatch(/5h: 100% used/);
    expect(pillLabel).toMatch(/weekly: 100% used/);
  });

  it("keeps the exhausted percentage when hide-percent has no future reset", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 100, {
        exhausted: true,
        resetsAt: null,
        primaryWindowMinutes: 300,
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarHidePercentWhenExhausted: true }),
    );

    const { container } = renderFloatBar(
      bootstrap({ floatBarHidePercentWhenExhausted: true }),
    );
    await act(async () => vi.runOnlyPendingTimersAsync());

    expect(
      Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
    ).toEqual(["100%"]);
  });

  it("renders the exhausted reset as a local clock when clock mode is on", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-08-18T00:00:00Z");
    vi.setSystemTime(now);
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 100, {
        exhausted: true,
        resetsAt: "2026-08-22T12:00:00Z",
        primaryWindowMinutes: 300,
        secondary: {
          used: 100,
          exhausted: true,
          windowMinutes: 10_080,
          resetsAt: "2026-08-18T03:12:00Z",
        },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarHidePercentWhenExhausted: true, floatBarExhaustedClockTime: true }),
    );

    const { container } = renderFloatBar(
      bootstrap({ floatBarHidePercentWhenExhausted: true, floatBarExhaustedClockTime: true }),
    );
    await act(async () => vi.runOnlyPendingTimersAsync());

    // Mirror the clock formatter so expectations stay timezone-independent.
    const clock = (iso: string): string => {
      const d = new Date(iso);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      return sameDay ? `${hh}:${mm}` : `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
    };

    expect(
      Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
    ).toEqual([clock("2026-08-22T12:00:00Z"), clock("2026-08-18T03:12:00Z")]);
  });

  it("uses weekday labels for resets within the coming week", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-08-18T00:00:00Z");
    vi.setSystemTime(now);
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 100, {
        exhausted: true,
        // +4 days (Sat) and +6 days (Mon) fall inside tomorrow..+6.
        resetsAt: "2026-08-22T12:00:00Z",
        primaryWindowMinutes: 300,
        secondary: {
          used: 100,
          exhausted: true,
          windowMinutes: 10_080,
          resetsAt: "2026-08-24T12:00:00Z",
        },
        tertiary: {
          used: 100,
          exhausted: true,
          windowMinutes: 43_200,
          // +7 days is the *same* weekday next week → keep the M/D date.
          resetsAt: "2026-08-25T12:00:00Z",
        },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({
        floatBarHidePercentWhenExhausted: true,
        floatBarExhaustedClockTime: true,
        floatBarExhaustedWeekdayTime: true,
      }),
    );

    const { container } = renderFloatBar(
      bootstrap({
        floatBarHidePercentWhenExhausted: true,
        floatBarExhaustedClockTime: true,
        floatBarExhaustedWeekdayTime: true,
      }),
    );
    await act(async () => vi.runOnlyPendingTimersAsync());

    // Mirror the formatter (weekday within 1..=6 local calendar days).
    const format = (iso: string, useWeekday: boolean): string => {
      const d = new Date(iso);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const clock = `${hh}:${mm}`;
      const startOfDay = (x: Date) =>
        new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
      const sameDay = dayDiff === 0;
      if (sameDay) return clock;
      if (useWeekday && dayDiff >= 1 && dayDiff <= 6) {
        return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${clock}`;
      }
      return `${d.getMonth() + 1}/${d.getDate()} ${clock}`;
    };

    expect(
      Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
    ).toEqual([
      format("2026-08-22T12:00:00Z", true),
      format("2026-08-24T12:00:00Z", true),
      // +7 days is beyond the coming week → weekday=off keeps the M/D date.
      format("2026-08-25T12:00:00Z", true),
    ]);
  });

  it("prefers the countdown when clock mode is off", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 100, {
        exhausted: true,
        resetsAt: "2026-08-22T12:00:00Z",
        primaryWindowMinutes: 300,
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(
      settings({ floatBarHidePercentWhenExhausted: true }),
    );

    const { container } = renderFloatBar(
      bootstrap({ floatBarHidePercentWhenExhausted: true }),
    );
    await act(async () => vi.runOnlyPendingTimersAsync());

    expect(
      Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
    ).toEqual(["4d 12h"]);
  });

  it("polls refreshProvidersIfStale on the configured interval", async () => {
    vi.useFakeTimers();
    try {
      tauriMocks.getCachedProviders.mockResolvedValue([]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());
      // 60s minimum is enforced in FloatBar.tsx; use the floor here.
      await act(async () => {
        renderFloatBar(bootstrap({ refreshIntervalSecs: 60 }));
      });

      // Initial tick fires synchronously on mount; useProviders is passive here
      // so the floatbar does not double-request stale refreshes at startup.
      await vi.waitFor(() => {
        expect(tauriMocks.refreshProvidersIfStale).toHaveBeenCalledTimes(1);
      });
      const initialCalls = tauriMocks.refreshProvidersIfStale.mock.calls.length;

      // Advance the timer past the 60-second interval — the floatbar tick
      // should fire again. Wrapped in act because the shared 30s now clock
      // also fires during the advance.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(tauriMocks.refreshProvidersIfStale.mock.calls.length).toBeGreaterThan(
        initialCalls,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  describe("floatBarBatteryStyle", () => {
    it("renders percentage numbers when battery style is OFF", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        snapshot("codex", "Codex", 25),
      ]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarBatteryStyle: false }),
      );

      const { container } = renderFloatBar(
        bootstrap({ floatBarBatteryStyle: false }),
      );

      await waitFor(() => {
        expect(screen.getByText("25%")).toBeInTheDocument();
      });
      expect(container.querySelector(".floatbar__battery")).toBeNull();
    });

    it("renders battery cell when battery style is ON", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        snapshot("codex", "Codex", 25),
      ]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarBatteryStyle: true }),
      );

      const { container } = renderFloatBar(
        bootstrap({ floatBarBatteryStyle: true }),
      );

      await waitFor(() => {
        const meter = screen.getByRole("meter");
        expect(meter).toBeInTheDocument();
        expect(meter).toHaveAttribute("aria-valuenow", "75");
      });

      expect(screen.queryByText("25%")).not.toBeInTheDocument();

      const fill = container.querySelector<HTMLElement>(".floatbar__battery-fill");
      expect(fill).not.toBeNull();
      expect(fill?.style.width).toBe("75%");

      const nub = container.querySelector(".floatbar__battery-nub");
      expect(nub).not.toBeNull();
    });

    it("renders remaining countdown instead of battery when exhausted with reset and hidePercentWhenExhausted", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
        tauriMocks.getCachedProviders.mockResolvedValue([
          snapshot("claude", "Claude", 100, {
            exhausted: true,
            resetsAt: "2026-08-22T12:00:00Z",
            primaryWindowMinutes: 300,
          }),
        ]);
        tauriMocks.getSettingsSnapshot.mockResolvedValue(
          settings({
            floatBarBatteryStyle: true,
            floatBarHidePercentWhenExhausted: true,
          }),
        );

        const { container } = renderFloatBar(
          bootstrap({
            floatBarBatteryStyle: true,
            floatBarHidePercentWhenExhausted: true,
          }),
        );
        await act(async () => vi.runOnlyPendingTimersAsync());

        expect(
          Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
        ).toEqual(["4d 12h"]);
        expect(container.querySelector(".floatbar__battery")).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("renders '—' when provider has error even with battery style ON", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        snapshot("codex", "Codex", 0, { error: "Network disconnected" }),
      ]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarBatteryStyle: true }),
      );

      const { container } = renderFloatBar(
        bootstrap({ floatBarBatteryStyle: true }),
      );

      await waitFor(() => {
        expect(container.querySelectorAll(".floatbar__metric")[0].textContent).toBe("—");
      });
      expect(container.querySelector(".floatbar__battery")).toBeNull();
    });

    it("gives the inline reset its own spaced element beside the battery", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
        tauriMocks.getCachedProviders.mockResolvedValue([
          snapshot("claude", "Claude", 25, {
            resetsAt: "2026-08-22T12:00:00Z",
            primaryWindowMinutes: 300,
          }),
        ]);
        tauriMocks.getSettingsSnapshot.mockResolvedValue(
          settings({ floatBarBatteryStyle: true, floatBarShowResetInline: true }),
        );

        const { container } = renderFloatBar(
          bootstrap({ floatBarBatteryStyle: true, floatBarShowResetInline: true }),
        );
        await act(async () => vi.runOnlyPendingTimersAsync());

        // The battery metric row is a flex container: a bare text node would
        // lose its leading space there, so the countdown keeps its own element
        // (`.floatbar__battery-reset`) for the explicit scaled gap.
        const reset = container.querySelector(".floatbar__battery-reset");
        expect(reset).not.toBeNull();
        expect(reset?.textContent).toBe("4d");
        expect(container.querySelector(".floatbar__battery")).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps a Grok-like dark brand battery fill visible", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        snapshot("grok", "Grok", 25),
      ]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ enabledProviders: ["grok"], floatBarBatteryStyle: true }),
      );

      const { container } = renderFloatBar(
        bootstrap({ enabledProviders: ["grok"], floatBarBatteryStyle: true }),
      );

      await waitFor(() => expect(screen.getByRole("meter")).toBeInTheDocument());
      const fill = container.querySelector<HTMLElement>(".floatbar__battery-fill");
      const cell = container.querySelector<HTMLElement>(".floatbar__battery-cell");
      expect(fill).not.toBeNull();
      expect(cell).not.toBeNull();
      expect(cssRuleBlock(floatBarCss, ".floatbar__battery-fill")).toContain(
        "background: currentColor",
      );
    });

    it("renders every cadence as a battery when the slot list is empty", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        snapshot("codex", "Codex", 25, {
          secondary: { used: 40 },
          tertiary: { used: 60, windowMinutes: 40_320 },
        }),
      ]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarBatteryStyle: true, floatBarBatterySlots: [] }),
      );

      const { container } = renderFloatBar(
        bootstrap({ floatBarBatteryStyle: true, floatBarBatterySlots: [] }),
      );

      await waitFor(() =>
        expect(container.querySelectorAll(".floatbar__battery")).toHaveLength(3),
      );
      expect(
        Array.from(
          container.querySelectorAll<HTMLElement>(".floatbar__battery-fill"),
          (fill) => fill.style.width,
        ),
      ).toEqual(["75%", "60%", "40%"]);
    });

    it.each([
      [85, "floatbar__metric--warn"],
      [95, "floatbar__metric--crit"],
    ] as const)(
      "uses remaining-based %s tone thresholds with show remaining OFF",
      async (used, toneClass) => {
        tauriMocks.getCachedProviders.mockResolvedValue([
          snapshot("codex", "Codex", used),
        ]);
        tauriMocks.getSettingsSnapshot.mockResolvedValue(
          settings({
            floatBarBatteryStyle: true,
            floatBarShowRemaining: false,
          }),
        );

        const { container } = renderFloatBar(
          bootstrap({
            floatBarBatteryStyle: true,
            floatBarShowRemaining: false,
          }),
        );

        await waitFor(() =>
          expect(container.querySelector(`.${toneClass}`)).not.toBeNull(),
        );
      },
    );

    it("falls back to percentage text when no stored slot is recognized", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        snapshot("codex", "Codex", 25, {
          secondary: { used: 40 },
          tertiary: { used: 60, windowMinutes: 40_320 },
        }),
      ]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarBatteryStyle: true, floatBarBatterySlots: ["unknown"] }),
      );

      const { container } = renderFloatBar(
        bootstrap({
          floatBarBatteryStyle: true,
          floatBarBatterySlots: ["unknown"],
        }),
      );

      await waitFor(() => {
        expect(container.querySelector(".floatbar__battery")).toBeNull();
        expect(
          Array.from(container.querySelectorAll(".floatbar__metric"), (metric) =>
            metric.textContent,
          ),
        ).toEqual(["25%", "40%", "60%"]);
      });
    });

    it("renders only the selected cadence as a battery", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        snapshot("codex", "Codex", 25, {
          secondary: { used: 40 },
          tertiary: { used: 60, windowMinutes: 40_320 },
        }),
      ]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarBatteryStyle: true, floatBarBatterySlots: ["weekly"] }),
      );

      const { container } = renderFloatBar(
        bootstrap({
          floatBarBatteryStyle: true,
          floatBarBatterySlots: ["weekly"],
        }),
      );

      await waitFor(() =>
        expect(container.querySelectorAll(".floatbar__battery")).toHaveLength(1),
      );
      expect(container.querySelector<HTMLElement>(".floatbar__battery-fill")?.style.width).toBe(
        "60%",
      );
      expect(Array.from(container.querySelectorAll(".floatbar__metric"), (metric) => metric.textContent)).toEqual([
        "25%",
        "",
        "60%",
      ]);
    });

    it("ignores unknown entries while retaining recognized battery slots", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        snapshot("codex", "Codex", 25, {
          secondary: { used: 40 },
          tertiary: { used: 60, windowMinutes: 40_320 },
        }),
      ]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({
          floatBarBatteryStyle: true,
          floatBarBatterySlots: ["weekly", "future-slot"],
        }),
      );

      const { container } = renderFloatBar(
        bootstrap({
          floatBarBatteryStyle: true,
          floatBarBatterySlots: ["weekly", "future-slot"],
        }),
      );

      await waitFor(() =>
        expect(container.querySelectorAll(".floatbar__battery")).toHaveLength(1),
      );
      expect(container.querySelector<HTMLElement>(".floatbar__battery-fill")?.style.width).toBe(
        "60%",
      );
    });

    it("uses the fallback slot selection for cadence-less providers", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        cadenceless("antigravity", "Antigravity"),
      ]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({
          enabledProviders: ["antigravity"],
          floatBarBatteryStyle: true,
          floatBarBatterySlots: ["fallback"],
        }),
      );

      const { container } = renderFloatBar(
        bootstrap({
          enabledProviders: ["antigravity"],
          floatBarBatteryStyle: true,
          floatBarBatterySlots: ["fallback"],
        }),
      );

      await waitFor(() =>
        expect(container.querySelectorAll(".floatbar__battery")).toHaveLength(1),
      );
      expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "45");
    });
  });

  describe("floatBarShowRemaining", () => {
    it("keeps consumed percentages when show remaining is OFF", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([snapshot("codex", "Codex", 25)]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarShowRemaining: false }),
      );

      const { container } = renderFloatBar(bootstrap({ floatBarShowRemaining: false }));

      await waitFor(() => {
        expect(screen.getByText("25%")).toBeInTheDocument();
      });
      expect(screen.queryByText("75%")).not.toBeInTheDocument();
      expect(container.querySelector(".floatbar__pill")?.getAttribute("aria-label")).toContain(
        "25% used",
      );
    });

    it("renders remaining percentages when show remaining is ON", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([snapshot("codex", "Codex", 25)]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarShowRemaining: true }),
      );

      const { container } = renderFloatBar(bootstrap({ floatBarShowRemaining: true }));

      await waitFor(() => {
        expect(screen.getByText("75%")).toBeInTheDocument();
      });
      expect(screen.queryByText("25%")).not.toBeInTheDocument();
      expect(container.querySelector(".floatbar__pill")?.getAttribute("aria-label")).toContain(
        "75% remaining",
      );
    });

    it("keeps a healthy remaining slot out of warn and crit", async () => {
      // 25% used → 75% remaining, well above the 30% warn cutoff.
      tauriMocks.getCachedProviders.mockResolvedValue([snapshot("claude", "Claude", 25)]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarShowRemaining: true }),
      );

      const { container } = renderFloatBar(bootstrap({ floatBarShowRemaining: true }));

      await waitFor(() => {
        expect(screen.getByText("75%")).toBeInTheDocument();
      });
      expect(container.querySelector(".floatbar__metric--warn")).toBeNull();
      expect(container.querySelector(".floatbar__metric--crit")).toBeNull();
    });

    it("tones low remaining as warn (mirrored high threshold)", async () => {
      // highUsageThreshold = 70 → remaining cutoff 30%. 85% used → 15% left → warn.
      tauriMocks.getCachedProviders.mockResolvedValue([snapshot("claude", "Claude", 85)]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarShowRemaining: true }),
      );

      const { container } = renderFloatBar(bootstrap({ floatBarShowRemaining: true }));

      await waitFor(() => {
        expect(screen.getByText("15%")).toBeInTheDocument();
      });
      expect(container.querySelector(".floatbar__metric--warn")).not.toBeNull();
      expect(container.querySelector(".floatbar__metric--crit")).toBeNull();
    });

    it("tones low remaining as crit (mirrored critical threshold)", async () => {
      // criticalUsageThreshold = 90 → remaining cutoff 10%. 95% used → 5% left → crit.
      tauriMocks.getCachedProviders.mockResolvedValue([snapshot("claude", "Claude", 95)]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarShowRemaining: true }),
      );

      const { container } = renderFloatBar(bootstrap({ floatBarShowRemaining: true }));

      await waitFor(() => {
        expect(screen.getByText("5%")).toBeInTheDocument();
      });
      expect(container.querySelector(".floatbar__metric--crit")).not.toBeNull();
    });

    it("fills the battery with remaining quota when both options are ON", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([snapshot("codex", "Codex", 25)]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarBatteryStyle: true, floatBarShowRemaining: true }),
      );

      const { container } = renderFloatBar(
        bootstrap({ floatBarBatteryStyle: true, floatBarShowRemaining: true }),
      );

      await waitFor(() => {
        expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "75");
      });

      const fill = container.querySelector<HTMLElement>(".floatbar__battery-fill");
      expect(fill).not.toBeNull();
      expect(fill?.style.width).toBe("75%");
      expect(screen.getByRole("meter").getAttribute("aria-label")).toBe("75% remaining");
      expect(screen.queryByText("25%")).not.toBeInTheDocument();
    });

    it("keeps the battery fill on remaining quota when show remaining is OFF", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([snapshot("codex", "Codex", 25)]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarBatteryStyle: true, floatBarShowRemaining: false }),
      );

      const { container } = renderFloatBar(
        bootstrap({ floatBarBatteryStyle: true, floatBarShowRemaining: false }),
      );

      await waitFor(() => {
        expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "75");
      });

      const fill = container.querySelector<HTMLElement>(".floatbar__battery-fill");
      expect(fill?.style.width).toBe("75%");
      // Battery accessibility always describes remaining quota.
      expect(screen.getByRole("meter").getAttribute("aria-label")).toBe("75% remaining");
    });

    it("keeps the exhausted hide-percent countdown when show remaining is ON", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
        tauriMocks.getCachedProviders.mockResolvedValue([
          snapshot("claude", "Claude", 100, {
            exhausted: true,
            resetsAt: "2026-08-22T12:00:00Z",
            primaryWindowMinutes: 300,
          }),
        ]);
        tauriMocks.getSettingsSnapshot.mockResolvedValue(
          settings({
            floatBarShowRemaining: true,
            floatBarHidePercentWhenExhausted: true,
          }),
        );

        const { container } = renderFloatBar(
          bootstrap({
            floatBarShowRemaining: true,
            floatBarHidePercentWhenExhausted: true,
          }),
        );
        await act(async () => vi.runOnlyPendingTimersAsync());

        // Exhausted slots keep the time-only path: remaining is 0%, but the
        // reset countdown still replaces the percentage.
        expect(
          Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
        ).toEqual(["4d 12h"]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps the '—' fallback on provider error when show remaining is ON", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([
        snapshot("codex", "Codex", 0, { error: "Network disconnected" }),
      ]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarShowRemaining: true, floatBarBatteryStyle: true }),
      );

      const { container } = renderFloatBar(
        bootstrap({ floatBarShowRemaining: true, floatBarBatteryStyle: true }),
      );

      await waitFor(() => {
        expect(container.querySelectorAll(".floatbar__metric")[0].textContent).toBe("—");
      });
      expect(container.querySelector(".floatbar__battery")).toBeNull();
    });
  });

  describe("floatBarPaceTextColor", () => {
    function pacedSnapshot() {
      const snap = snapshot("claude", "Claude", 40);
      snap.pace = {
        stage: "ahead",
        deltaPercent: 8,
        expectedUsedPercent: 30,
        actualUsedPercent: 38,
        etaSeconds: 49 * 60,
        willLastToReset: false,
        elapsedSeconds: 12_000,
        resetsInSeconds: 6000,
      };
      return snap;
    }

    it("shows per-lane pace in the pill hover detail", async () => {
      tauriMocks.getCachedProviders.mockResolvedValue([pacedSnapshot()]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

      const { container } = renderFloatBar(bootstrap());

      await waitFor(() => {
        expect(screen.getByText("40%")).toBeInTheDocument();
      });
      const title = container.querySelector(".floatbar__pill")?.getAttribute("title") ?? "";
      expect(title).toContain("5h: Ahead (+8.0%), 49m/1h 40m");
      expect(title).not.toContain("elapsed");
    });

    it("tints only the reset countdown with the pace color when enabled", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
        const snap = snapshot("claude", "Claude", 40, {
          resetsAt: "2026-08-22T12:00:00Z",
          primaryWindowMinutes: 300,
        });
        snap.pace = {
          stage: "ahead",
          deltaPercent: 8,
          expectedUsedPercent: 30,
          actualUsedPercent: 38,
          etaSeconds: null,
          willLastToReset: true,
          elapsedSeconds: 12_000,
          resetsInSeconds: 6000,
        };
        tauriMocks.getCachedProviders.mockResolvedValue([snap]);
        tauriMocks.getSettingsSnapshot.mockResolvedValue(
          settings({ floatBarShowResetInline: true, floatBarPaceTextColor: true }),
        );

        const { container } = renderFloatBar(
          bootstrap({ floatBarShowResetInline: true, floatBarPaceTextColor: true }),
        );
        await act(async () => vi.runOnlyPendingTimersAsync());

        // Percent keeps the threshold tone (40% used is ok → no tone class).
        const metric = container.querySelector(".floatbar__metric");
        expect(metric?.textContent).toBe("40% 4d");
        expect(metric?.className).not.toContain("pace");
        // Only the date part carries the pace bucket color.
        const reset = container.querySelector(".floatbar__metric-reset");
        expect(reset?.textContent).toContain("4d");
        expect(reset?.className).toContain("floatbar__metric--pace-racing");
      } finally {
        vi.useRealTimers();
      }
    });

    it("leaves the countdown untinted when the option is OFF", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
        tauriMocks.getCachedProviders.mockResolvedValue([
          snapshot("claude", "Claude", 40, {
            resetsAt: "2026-08-22T12:00:00Z",
            primaryWindowMinutes: 300,
          }),
        ]);
        tauriMocks.getSettingsSnapshot.mockResolvedValue(
          settings({ floatBarShowResetInline: true }),
        );

        const { container } = renderFloatBar(
          bootstrap({ floatBarShowResetInline: true }),
        );
        await act(async () => vi.runOnlyPendingTimersAsync());

        const reset = container.querySelector(".floatbar__metric-reset");
        expect(reset?.textContent).toContain("4d");
        expect(reset?.className).not.toContain("pace");
      } finally {
        vi.useRealTimers();
      }
    });

    it("tints the battery-adjacent countdown but not the cell when both options are ON", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
        const snap = snapshot("claude", "Claude", 40, {
          resetsAt: "2026-08-22T12:00:00Z",
          primaryWindowMinutes: 300,
        });
        snap.pace = {
          stage: "ahead",
          deltaPercent: 8,
          expectedUsedPercent: 30,
          actualUsedPercent: 38,
          etaSeconds: null,
          willLastToReset: true,
          elapsedSeconds: 12_000,
          resetsInSeconds: 6000,
        };
        tauriMocks.getCachedProviders.mockResolvedValue([snap]);
        tauriMocks.getSettingsSnapshot.mockResolvedValue(
          settings({
            floatBarBatteryStyle: true,
            floatBarShowResetInline: true,
            floatBarPaceTextColor: true,
          }),
        );

        const { container } = renderFloatBar(
          bootstrap({
            floatBarBatteryStyle: true,
            floatBarShowResetInline: true,
            floatBarPaceTextColor: true,
          }),
        );
        await act(async () => vi.runOnlyPendingTimersAsync());

        // Battery cell keeps the remaining-quota fill and threshold tone.
        expect(container.querySelector(".floatbar__battery")).not.toBeNull();
        expect(
          container.querySelector<HTMLElement>(".floatbar__battery-fill")?.style.width,
        ).toBe("60%");
        expect(
          container.querySelector(".floatbar__metric.floatbar__metric--pace-racing"),
        ).toBeNull();
        // The date next to the cell takes the pace bucket color.
        const reset = container.querySelector(".floatbar__battery-reset");
        expect(reset?.textContent).toBe("4d");
        expect(reset?.className).toContain("floatbar__metric--pace-racing");
      } finally {
        vi.useRealTimers();
      }
    });

    it("tints the exhausted hide-percent countdown with the pace color", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
        const snap = snapshot("claude", "Claude", 100, {
          exhausted: true,
          resetsAt: "2026-08-22T12:00:00Z",
          primaryWindowMinutes: 300,
        });
        snap.pace = {
          stage: "far_ahead",
          deltaPercent: 20,
          expectedUsedPercent: 80,
          actualUsedPercent: 100,
          etaSeconds: null,
          willLastToReset: false,
          elapsedSeconds: 12_000,
          resetsInSeconds: 6000,
        };
        tauriMocks.getCachedProviders.mockResolvedValue([snap]);
        tauriMocks.getSettingsSnapshot.mockResolvedValue(
          settings({ floatBarHidePercentWhenExhausted: true, floatBarPaceTextColor: true }),
        );

        const { container } = renderFloatBar(
          bootstrap({ floatBarHidePercentWhenExhausted: true, floatBarPaceTextColor: true }),
        );
        await act(async () => vi.runOnlyPendingTimersAsync());

        const metric = container.querySelector(".floatbar__metric");
        expect(metric?.textContent).toBe("4d 12h");
        expect(
          metric?.querySelector("span.floatbar__metric--pace-burning"),
        ).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows hover pace deltas as time when the option is ON", async () => {
      const snap = snapshot("claude", "Claude", 40, {
        secondary: { used: 30 },
      });
      snap.pace = {
        stage: "ahead",
        deltaPercent: 8,
        expectedUsedPercent: 30,
        actualUsedPercent: 38,
        etaSeconds: 49 * 60,
        willLastToReset: false,
        elapsedSeconds: 12_000,
        resetsInSeconds: 6000,
      };
      snap.secondaryLabel = "Weekly";
      snap.secondaryPace = {
        stage: "behind",
        deltaPercent: -8,
        expectedUsedPercent: 38,
        actualUsedPercent: 30,
        etaSeconds: null,
        willLastToReset: true,
        elapsedSeconds: 12_000,
        resetsInSeconds: 6000,
      };
      tauriMocks.getCachedProviders.mockResolvedValue([snap]);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(
        settings({ floatBarPaceTimeDelta: true }),
      );

      const { container } = renderFloatBar(
        bootstrap({ floatBarPaceTimeDelta: true }),
      );

      await waitFor(() => {
        expect(screen.getByText("40%")).toBeInTheDocument();
      });
      const title = container.querySelector(".floatbar__pill")?.getAttribute("title") ?? "";
      expect(title).toContain("5h: Ahead (+24m), 49m/1h 40m");
      expect(title).toContain("Weekly: Behind (-13h 26m)");
      expect(title).not.toContain("+8.0%");
    });

    it("declares the pace bucket colors in CSS", () => {
      expect(cssRuleBlock(floatBarCss, ".floatbar__metric--pace-slow")).toContain("#60a5fa");
      expect(cssRuleBlock(floatBarCss, ".floatbar__metric--pace-steady")).toContain("#22c55e");
      expect(cssRuleBlock(floatBarCss, ".floatbar__metric--pace-racing")).toContain("#fb923c");
      expect(cssRuleBlock(floatBarCss, ".floatbar__metric--pace-burning")).toContain("#ef476f");
    });
  });

  describe("floatBarFollowProviderOrder", () => {
    async function renderWithProviders(
      settingsOverrides: Partial<SettingsSnapshot>,
      providers = [
        snapshot("claude", "Claude", 20),
        snapshot("codex", "Codex", 75),
        snapshot("gemini", "Gemini", 50),
      ],
    ) {
      // The default fixture only enables claude/codex; include gemini so the
      // enabled filter does not hide the third pill under test.
      const overrides = {
        enabledProviders: ["claude", "codex", "gemini"],
        ...settingsOverrides,
      };
      tauriMocks.getCachedProviders.mockResolvedValue(providers);
      tauriMocks.getSettingsSnapshot.mockResolvedValue(settings(overrides));
      const { container } = renderFloatBar(bootstrap(overrides));
      await waitFor(() => {
        expect(container.querySelectorAll(".floatbar__pill").length).toBe(providers.length);
      });
      return container;
    }

    function pillOrder(container: HTMLElement): string[] {
      return Array.from(container.querySelectorAll(".floatbar__pill")).map((el) =>
        (el.getAttribute("title") ?? "").split(":")[0],
      );
    }

    it("keeps usage-descending order when the option is OFF", async () => {
      const container = await renderWithProviders({ floatBarFollowProviderOrder: false });
      expect(pillOrder(container)).toEqual(["Codex", "Gemini", "Claude"]);
    });

    it("keeps usage-descending order when ON but the custom order is empty", async () => {
      const container = await renderWithProviders({
        floatBarFollowProviderOrder: true,
        providerOrder: [],
      });
      expect(pillOrder(container)).toEqual(["Codex", "Gemini", "Claude"]);
    });

    it("follows the custom drag-reorder sequence when ON with a custom order", async () => {
      const container = await renderWithProviders({
        floatBarFollowProviderOrder: true,
        providerOrder: ["gemini", "claude", "codex"],
      });
      expect(pillOrder(container)).toEqual(["Gemini", "Claude", "Codex"]);
    });

    it("does not crash with unknown ids in the custom order", async () => {
      const container = await renderWithProviders({
        floatBarFollowProviderOrder: true,
        providerOrder: ["unknown-provider", "claude", "codex"],
      });
      // Unknown ids are skipped by the ordering helper; known providers keep
      // their relative custom sequence (Claude before Codex).
      expect(pillOrder(container)).toEqual(["Claude", "Codex", "Gemini"]);
    });
  });
});
