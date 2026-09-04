import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriMocks = vi.hoisted(() => ({
  getAppInfo: vi.fn(),
  openExternalUrl: vi.fn(),
}));

const updateMocks = vi.hoisted(() => ({
  checkNow: vi.fn(),
  download: vi.fn(),
  apply: vi.fn(),
  dismiss: vi.fn(),
  openRelease: vi.fn(),
  updateState: {
    status: "idle",
    version: null as string | null,
    error: null as string | null,
    progress: null as number | null,
    releaseUrl: null as string | null,
    canDownload: false,
    canApply: false,
    lastCheckedAt: null as number | null,
  },
}));

vi.mock("../../../lib/tauri", () => tauriMocks);
vi.mock("../../../hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));
vi.mock("../../../hooks/useUpdateState", () => ({
  useUpdateState: () => ({
    updateState: updateMocks.updateState,
    checkNow: updateMocks.checkNow,
    download: updateMocks.download,
    apply: updateMocks.apply,
    dismiss: updateMocks.dismiss,
    openRelease: updateMocks.openRelease,
  }),
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
    updateMocks.updateState = {
      status: "idle",
      version: null,
      error: null,
      progress: null,
      releaseUrl: null,
      canDownload: false,
      canApply: false,
      lastCheckedAt: null,
    };
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

  it("renders updater controls and triggers update check", async () => {
    const set = vi.fn();
    render(<AboutTab settings={settings} set={set} saving={false} />);

    await screen.findByRole("button", { name: "AboutLinkGitHub" });

    const checkBtn = screen.getByRole("button", { name: "AboutCheckForUpdates" });
    expect(checkBtn).toBeInTheDocument();
    fireEvent.click(checkBtn);
    expect(updateMocks.checkNow).toHaveBeenCalled();

    const toggle = screen.getByRole("checkbox", { name: "AutoDownloadUpdates" });
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(set).toHaveBeenCalledWith({ autoDownloadUpdates: true });
  });

  it("renders update available state and download action", async () => {
    updateMocks.updateState = {
      status: "available",
      version: "personal-latest-1ebb612",
      error: null,
      progress: null,
      releaseUrl: "https://github.com/junglesub/Win-CodexBar/releases/tag/personal-latest",
      canDownload: true,
      canApply: false,
      lastCheckedAt: null,
    };

    render(<AboutTab settings={settings} set={vi.fn()} saving={false} />);

    await screen.findByRole("button", { name: "AboutLinkGitHub" });

    expect(screen.getByText("UpdateAvailableMessage")).toBeInTheDocument();
    const downloadBtn = screen.getByRole("button", { name: "BannerDownloadButton" });
    fireEvent.click(downloadBtn);
    expect(updateMocks.download).toHaveBeenCalled();
  });

  it("renders update ready state and apply action", async () => {
    updateMocks.updateState = {
      status: "ready",
      version: "personal-latest-1ebb612",
      error: null,
      progress: null,
      releaseUrl: "https://github.com/junglesub/Win-CodexBar/releases/tag/personal-latest",
      canDownload: false,
      canApply: true,
      lastCheckedAt: null,
    };

    render(<AboutTab settings={settings} set={vi.fn()} saving={false} />);

    await screen.findByRole("button", { name: "AboutLinkGitHub" });

    expect(screen.getByText("UpdateReady")).toBeInTheDocument();
    const applyBtn = screen.getByRole("button", { name: "BannerInstallRestart" });
    fireEvent.click(applyBtn);
    expect(updateMocks.apply).toHaveBeenCalled();
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
