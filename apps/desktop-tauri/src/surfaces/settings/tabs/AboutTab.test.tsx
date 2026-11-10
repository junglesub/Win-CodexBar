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
vi.mock("./acknowledgements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./acknowledgements")>()),
  loadAcknowledgements: vi.fn(async () => [
    {
      name: "alpha-crate",
      ecosystem: "cargo",
      versions: ["1.2.3"],
      authors: ["Ann Author", "Ben Builder", "Cy Coder", "Di Dev"],
      url: "https://example.com/alpha",
      license: "MIT OR Apache-2.0",
      notices: [{ file: "LICENSE-MIT", text: "Permission is hereby granted, free of charge" }],
    },
    {
      name: "beta-pkg",
      ecosystem: "npm",
      versions: ["4.5.6"],
      authors: ["Solo Maintainer"],
      url: "https://example.com/beta",
      license: "ISC",
      notices: [],
    },
  ]),
}));
vi.mock("../../../hooks/useLocale", () => ({
  // AboutBuilt keeps its Fluent `{}` placeholder so the rendered date is asserted.
  useLocale: () => ({ t: (key: string) => (key === "AboutBuilt" ? "Built {}" : key) }),
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
import { makeSettings } from "../../../test/fixtures";

const settings: SettingsSnapshot = makeSettings({
  enabledProviders: [],
  menuBarShowsHighestUsage: true,
  menuBarShowsPercent: true,
  menuBarIconStyle: "percent",
  showAsUsed: false,
  floatBarBatteryStyle: false,
  floatBarBatterySlots: [],
  floatBarShowRemaining: false,
  floatBarFollowProviderOrder: false,
  showAllTokenAccountsInMenu: true,
  menuBarDisplayMode: "compact",
  globalShortcut: "",
  claudeAvoidKeychainPrompts: true,
  floatBarOpacity: 0.9,
});

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

describe("AboutTab acknowledgements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.getAppInfo.mockResolvedValue({
      name: "CodexBar",
      version: "0.70.0",
      buildNumber: "dev",
      updateChannel: "stable",
      tagline: "Keep agent limits in view.",
    });
    tauriMocks.openExternalUrl.mockResolvedValue(undefined);
  });

  it("opens the list, expands a component's notices and returns to About", async () => {
    const { container } = render(<AboutTab settings={settings} set={vi.fn()} saving={false} />);

    fireEvent.click(await screen.findByRole("button", { name: "AboutLinkAcknowledgements" }));

    const summary = (await screen.findByText("alpha-crate")).closest("summary");
    expect(summary).toHaveTextContent("alpha-crate");
    expect(summary).toHaveTextContent("Ann Author, Ben Builder, AcknowledgementsOthers");
    expect(summary).toHaveTextContent("MIT OR Apache-2.0");
    expect(screen.getByText("AcknowledgementsFooter")).toBeInTheDocument();
    expect(screen.queryByText(/Permission is hereby granted/)).toBeNull();

    const details = summary!.parentElement as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));

    expect(await screen.findByText(/Permission is hereby granted/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AcknowledgementsAuthors" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "https://example.com/alpha" }));
    expect(tauriMocks.openExternalUrl).toHaveBeenCalledWith("https://example.com/alpha");

    fireEvent.click(screen.getByRole("button", { name: /TabAbout/ }));
    expect(await screen.findByText("Keep agent limits in view.")).toBeInTheDocument();
    expect(container.querySelector(".acknowledgement")).toBeNull();
  });

  it("links the SPDX page when a component publishes no license file", async () => {
    render(<AboutTab settings={settings} set={vi.fn()} saving={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "AboutLinkAcknowledgements" }));

    const details = (await screen.findByText("beta-pkg")).closest("details") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));

    expect(await screen.findByRole("heading", { name: "AcknowledgementsAuthor" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "https://spdx.org/licenses/ISC.html" }));
    expect(tauriMocks.openExternalUrl).toHaveBeenCalledWith("https://spdx.org/licenses/ISC.html");
  });
});

describe("AboutTab Mac grouped layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.openExternalUrl.mockResolvedValue(undefined);
  });

  it("shows the build date in the hero when the shell reports one", async () => {
    tauriMocks.getAppInfo.mockResolvedValue({
      name: "CodexBar",
      version: "0.70.0",
      buildNumber: "7",
      buildDate: "2026-10-11",
      updateChannel: "stable",
      tagline: "Keep agent limits in view.",
    });
    render(<AboutTab settings={settings} set={vi.fn()} saving={false} />);

    expect(await screen.findByText("Built 2026-10-11")).toBeInTheDocument();
    expect(screen.getByText("Version 0.70.0 (7)")).toBeInTheDocument();
  });

  it("leaves the build line out when no build date is known", async () => {
    tauriMocks.getAppInfo.mockResolvedValue({
      name: "CodexBar",
      version: "0.70.0",
      buildNumber: "dev",
      updateChannel: "stable",
      tagline: "Keep agent limits in view.",
    });
    render(<AboutTab settings={settings} set={vi.fn()} saving={false} />);

    await screen.findByText("Keep agent limits in view.");
    expect(screen.queryByText(/^Built /)).toBeNull();
  });

  it("groups Updates then Links, with Submit an Issue as a link row", async () => {
    tauriMocks.getAppInfo.mockResolvedValue({
      name: "CodexBar",
      version: "0.70.0",
      buildNumber: "dev",
      updateChannel: "stable",
      tagline: "Keep agent limits in view.",
    });
    const { container } = render(
      <AboutTab settings={settings} set={vi.fn()} saving={false} />,
    );
    await screen.findByText("Keep agent limits in view.");

    const titles = Array.from(
      container.querySelectorAll(".settings-group__title"),
      (node) => node.textContent,
    );
    expect(titles).toEqual(["UpdatesTitle", "SectionLinks"]);
    const linkRows = Array.from(
      container.querySelectorAll(".settings-link-row"),
      (node) => node.textContent,
    );
    expect(linkRows).toEqual([
      "AboutLinkGitHub↗",
      "AboutLinkWebsite↗",
      "AboutLinkOriginalProject↗",
      "SubmitIssue↗",
      "AboutLinkAcknowledgements›",
    ]);
    expect(screen.getByRole("checkbox", { name: "AutoDownloadUpdates" })).toHaveClass(
      "toggle--switch",
    );
    // Personal: the rolling `personal-latest` channel has no stable/beta split.
    expect(screen.queryByRole("combobox", { name: "UpdateChannelChoice" })).toBeNull();
    expect(screen.getByRole("button", { name: "AboutCheckForUpdates" })).toBeEnabled();
  });
});
