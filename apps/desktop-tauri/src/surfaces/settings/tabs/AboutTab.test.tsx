import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  getAppInfo: vi.fn(),
  openExternalUrl: vi.fn(),
}));

vi.mock("../../../lib/tauri", () => tauriMocks);
vi.mock("../../../hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

import AboutTab from "./AboutTab";
import type { SettingsSnapshot } from "../../../types/bridge";

const settings: SettingsSnapshot = {
  enabledProviders: [],
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
  menuBarShowsHighestUsage: true,
  menuBarShowsPercent: true,
  showAsUsed: false,
  showAllTokenAccountsInMenu: true,
  enableAnimations: true,
  resetTimeRelative: true,
  showResetWhenExhausted: false,
  menuBarDisplayMode: "compact",
  hidePersonalInfo: false,
  autoDownloadUpdates: false,
  installUpdatesOnQuit: false,
  globalShortcut: "",
  codexCustomSessionsDirs: [],
  updateChannel: "stable",
  uiLanguage: "english",
  theme: "dark",
  windowScalePercent: 125,
  trayScalePercent: 100,
  powertoysStatusPipeEnabled: false,
  claudeAvoidKeychainPrompts: true,
  codexSparkUsageVisible: true,
  disableKeychainAccess: false,
  providerMetrics: {},
  floatBarEnabled: false,
  floatBarOpacity: 0.9,
  floatBarBackgroundColor: "#FFFFFF",
  floatBarBackgroundOpacity: 8,
  floatBarScale: 100,
  floatBarOrientation: "horizontal",
  floatBarStyle: "floating",
  floatBarClickThrough: false,
  floatBarProviderIds: [],
  floatBarDarkText: false,
  floatBarShowResetInline: false,
  floatBarShowCost: false,
  claudeDailyRoutinesUsageVisible: true,
  claudeAllowReadingClaudeCodeCredentials: false,
  alibabaTokenPlanRegion: "cn",
  weeklyProgressWorkDays: null,
    costSummaryDisplayStyle: "compact",
    providerAccentColors: {},
};

describe("AboutTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.getAppInfo.mockResolvedValue({
      name: "CodexBar",
      version: "0.30.3",
      buildNumber: "dev",
      updateChannel: "stable",
      tagline: "Keep agent limits in view.",
    });
    tauriMocks.openExternalUrl.mockResolvedValue(undefined);
  });

  it("opens about links through the Tauri URL bridge", async () => {
    render(<AboutTab settings={settings} set={vi.fn()} saving={false} />);

    fireEvent.click(await screen.findByRole("button", { name: "AboutLinkGitHub" }));
    fireEvent.click(screen.getByRole("button", { name: "AboutLinkWebsite" }));
    fireEvent.click(screen.getByRole("button", { name: "AboutLinkOriginalProject" }));
    fireEvent.click(screen.getByRole("button", { name: "SubmitIssue" }));

    expect(tauriMocks.openExternalUrl).toHaveBeenNthCalledWith(
      1,
      "https://github.com/junglesub/Win-CodexBar",
    );
    expect(tauriMocks.openExternalUrl).toHaveBeenNthCalledWith(
      2,
      "https://junglesub.github.io/Win-CodexBar/",
    );
    expect(tauriMocks.openExternalUrl).toHaveBeenNthCalledWith(
      3,
      "https://github.com/steipete/CodexBar",
    );
    expect(tauriMocks.openExternalUrl).toHaveBeenNthCalledWith(
      4,
      "https://github.com/junglesub/Win-CodexBar/issues/new?labels=bug&template=bug_report.yml",
    );
  });

  it("retains the inline original-project credit link", async () => {
    render(<AboutTab settings={settings} set={vi.fn()} saving={false} />);

    // Wait for the app info to load so the About section (not the loading
    // placeholder) is rendered.
    await screen.findByRole("button", { name: "AboutLinkGitHub" });

    // The copyright line renders the brand name as a link to the original
    // macOS project.
    const inlineLink = screen.getByRole("button", { name: "AppName" });
    fireEvent.click(inlineLink);

    expect(tauriMocks.openExternalUrl).toHaveBeenCalledWith(
      "https://github.com/steipete/CodexBar",
    );
  });

  it("does not render updater controls or actions while the updater is disabled", async () => {
    render(<AboutTab settings={settings} set={vi.fn()} saving={false} />);

    await screen.findByRole("button", { name: "AboutLinkGitHub" });

    expect(
      screen.queryByRole("button", { name: "AboutCheckForUpdates" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "AutoDownloadUpdates" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("UpdateChannelChoice")).not.toBeInTheDocument();
    expect(screen.queryByText("InstallUpdatesOnQuit")).not.toBeInTheDocument();
    expect(screen.queryByText("UpdateChannelChoiceHelper")).not.toBeInTheDocument();
    expect(tauriMocks.getAppInfo).toHaveBeenCalled();
  });

  it("shows a link error if the OS browser launch fails", async () => {
    tauriMocks.openExternalUrl.mockRejectedValue("no browser");

    render(<AboutTab settings={settings} set={vi.fn()} saving={false} />);

    fireEvent.click(await screen.findByRole("button", { name: "AboutLinkWebsite" }));

    await waitFor(() => {
      expect(screen.getByText("ErrorPrefix no browser")).toBeInTheDocument();
    });
  });
});
