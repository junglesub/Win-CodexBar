import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  return {
    providerId: id,
    displayName: display,
    primary: rateWindow(used, {
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
    }),
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
    updatedAt: "2026-05-15T00:00:00Z",
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
    floatBarScale: 100,
    floatBarOrientation: "horizontal",
    floatBarStyle: "floating",
    floatBarClickThrough: false,
    floatBarProviderIds: [],
    floatBarDarkText: false,
    floatBarShowResetInline: false,
    floatBarShowCost: false,
    claudeDailyRoutinesUsageVisible: true,
    alibabaTokenPlanRegion: "cn",
    weeklyProgressWorkDays: null,
    ...overrides,
  };
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
        ResetsInHoursMinutes: "Resets in {}h {}m",
        ResetsInDaysHours: "Resets in {}d {}h",
        TrayResetsDueNow: "Resetting",
        PanelToday: "Today",
        PanelUsedSuffix: "used",
        FloatBarThirtyDayShort: "30d",
        FloatBarNoProviders: "No providers",
        FloatBarRemainingSuffix: "remaining",
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
    expect(titles[0]).toMatch(/Codex: 5h: 75% used\nweekly: —\nmonthly: —/);
    expect(titles[1]).toMatch(/Claude: 5h: 20% used\nweekly: —\nmonthly: —/);
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
        name: /Codex: 5h: 75% used\nweekly: —\nmonthly: —/,
      });
      const claude = screen.getByRole("group", {
        name: /Claude: 5h: 20% used\nweekly: —\nmonthly: —/,
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
      expect(container.querySelector(".floatbar__pill--crit")).not.toBeNull();
      // Pill detail must not show stale percentages.
      expect(container.querySelector(".floatbar__pill")?.getAttribute("aria-label")).toMatch(
        /DetailWindowModelSpecific: —/,
      );
    });
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
    expect(metrics.some((text) => text?.includes("2h 5m"))).toBe(true);
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
      ).toEqual(["—", "—", "8%"]);
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
      ).toEqual(["—", "41%", "—"]);
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
      ).toEqual(["10%", "41%", "—"]);
    });
  });

  it("renders missing and informational windows as dashes", async () => {
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
      ).toEqual(["—", "41%", "—"]);
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
        ).toEqual(["8%", "41%", "—"]);
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
      ).toEqual(["10%", "41%", "—"]);
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
      ).toEqual(["10%", "—", "90%"]);
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
      expect(container.querySelector(".floatbar__pill--crit")).not.toBeNull();
      // The pill detail must show three dashes, not stale percentages.
      expect(container.querySelector(".floatbar__pill")?.getAttribute("aria-label")).toBe(
        "Claude: 5h: —\nweekly: —\nmonthly: —",
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
      expect(container.querySelectorAll(".floatbar__pill--warn").length).toBe(2);
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
      ).toEqual(["20%", "90%", "—"]);
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
      ).toEqual(["—", "80%", "—"]);
      expect(container.querySelector(".floatbar__pill--warn")).not.toBeNull();
      // resetDescription alone is not enough for an inline countdown; the
      // pill accessibility detail still carries the weekly used percentage.
      expect(container.querySelector(".floatbar__pill")?.getAttribute("aria-label")).toMatch(
        /weekly: 80% used/,
      );
    });
  });

  it("keeps an informational primary window when no secondary window is available", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, { informational: true }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["—", "—", "—"]);
    });
  });

  it("keeps an informational primary window when the secondary window is informational", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 10, {
        informational: true,
        secondary: { used: 90, informational: true },
      }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(
        Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
      ).toEqual(["—", "—", "—"]);
    });
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
      // codex primary 5h 50% sorts first.
      const titles = Array.from(container.querySelectorAll(".floatbar__pill")).map(
        (pill) => pill.getAttribute("title"),
      );
      expect(titles).toEqual([
        "Codex: 5h: 50% used\nweekly: —\nmonthly: —",
        "Claude: 5h: —\nweekly: 20% used\nmonthly: —",
      ]);
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
      ).toEqual(["20%", "—", "—"]);
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
      expect(container.querySelector(".floatbar__pill--warn")).not.toBeNull();
    });
  });

  it("applies critical tone when the provider is exhausted", async () => {
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 100, { exhausted: true }),
    ]);
    tauriMocks.getSettingsSnapshot.mockResolvedValue(settings());

    const { container } = renderFloatBar(bootstrap());
    await waitFor(() => {
      expect(container.querySelector(".floatbar__pill--crit")).not.toBeNull();
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

  it("replaces every eligible percentage with its own relative reset", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
    tauriMocks.getCachedProviders.mockResolvedValue([
      snapshot("claude", "Claude", 100, {
        resetsAt: "2026-08-18T02:05:00Z",
        primaryWindowMinutes: 300,
        secondary: {
          used: 41,
          windowMinutes: 10_080,
          resetsAt: "2026-08-19T04:00:00Z",
        },
        tertiary: {
          used: 60,
          windowMinutes: 43_200,
          resetsAt: "2026-08-30T12:00:00Z",
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

    // Every eligible slot independently shows its own relative countdown.
    expect(
      Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
    ).toEqual(["2h 5m", "1d 4h", "12d 12h"]);
    // The pill accessibility detail retains cadence, used percentage, and the
    // localized reset for each slot.
    const pillLabel = container.querySelector(".floatbar__pill")?.getAttribute("aria-label");
    expect(pillLabel).toMatch(/5h: 100% used\nResets in 2h 5m/);
    expect(pillLabel).toMatch(/weekly: 41% used\nResets in 1d 4h/);
    expect(pillLabel).toMatch(/monthly: 60% used\nResets in 12d 12h/);
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
    ).toEqual(["2h 5m", "—", "—"]);
    // The tooltip/accessibility keeps the localized prose.
    expect(container.querySelector(".floatbar__pill")?.getAttribute("aria-label")).toMatch(
      /5h: 100% 使用済み\nリセットまで 2時間 5分/,
    );
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
      ).toEqual(["20%", "—", "—"]);
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
      ).toEqual(["20%", "41%", "—"]);
    });
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
      // should fire again.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(tauriMocks.refreshProvidersIfStale.mock.calls.length).toBeGreaterThan(
        initialCalls,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
