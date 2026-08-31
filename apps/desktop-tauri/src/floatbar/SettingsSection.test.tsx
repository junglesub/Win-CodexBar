import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SettingsSnapshot } from "../types/bridge";
import FloatBarSettingsSection from "./SettingsSection";

vi.mock("../hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key }),
}));

function settings(overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  return {
    floatBarEnabled: true,
    floatBarOpacity: 90,
    floatBarBackgroundColor: "#FFFFFF",
    floatBarBackgroundOpacity: 8,
    floatBarScale: 100,
    floatBarOrientation: "horizontal",
    floatBarStyle: "floating",
    floatBarShowCost: false,
    claudeDailyRoutinesUsageVisible: true,
    alibabaTokenPlanRegion: "cn",
    weeklyProgressWorkDays: null,
    floatBarShowResetInline: false,
    floatBarDarkText: false,
    floatBarClickThrough: false,
    ...overrides,
  } as SettingsSnapshot;
}

describe("FloatBar settings", () => {
  it("renders one cost toggle", () => {
    render(
      <FloatBarSettingsSection settings={settings()} saving={false} set={vi.fn()} />,
    );

    expect(screen.getAllByText("FloatBarShowCost")).toHaveLength(1);
  });

  it("sends an uppercased color patch on change", () => {
    const set = vi.fn();
    render(
      <FloatBarSettingsSection settings={settings()} saving={false} set={set} />,
    );

    fireEvent.change(screen.getByLabelText("FloatBarBackgroundColor"), {
      target: { value: "#12abef" },
    });

    expect(set).toHaveBeenCalledWith({ floatBarBackgroundColor: "#12ABEF" });
  });

  it("defers the background opacity save until pointer up", () => {
    const set = vi.fn();
    render(
      <FloatBarSettingsSection settings={settings()} saving={false} set={set} />,
    );

    const range = screen.getByLabelText("FloatBarBackgroundOpacity");
    fireEvent.change(range, { target: { value: "37" } });

    // Draft-only during `change`; no save yet.
    expect(set).not.toHaveBeenCalled();

    fireEvent.pointerUp(range);
    expect(set).toHaveBeenCalledWith({ floatBarBackgroundOpacity: 37 });
  });

  it("resets both background values in a single patch", () => {
    const set = vi.fn();
    render(
      <FloatBarSettingsSection
        settings={settings({
          floatBarBackgroundColor: "#12ABEF",
          floatBarBackgroundOpacity: 37,
        })}
        saving={false}
        set={set}
      />,
    );

    fireEvent.click(screen.getByText("FloatBarResetBackground"));

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({
      floatBarBackgroundColor: "#FFFFFF",
      floatBarBackgroundOpacity: 8,
    });
  });

  it("disables the background controls while saving", () => {
    render(
      <FloatBarSettingsSection settings={settings()} saving set={vi.fn()} />,
    );

    expect(screen.getByLabelText("FloatBarBackgroundColor")).toBeDisabled();
    expect(screen.getByLabelText("FloatBarBackgroundOpacity")).toBeDisabled();
    expect(screen.getByText("FloatBarResetBackground")).toBeDisabled();
  });

  it("disables the background controls when the float bar is off", () => {
    render(
      <FloatBarSettingsSection
        settings={settings({ floatBarEnabled: false })}
        saving={false}
        set={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("FloatBarBackgroundColor")).toBeDisabled();
    expect(screen.getByLabelText("FloatBarBackgroundOpacity")).toBeDisabled();
    expect(screen.getByText("FloatBarResetBackground")).toBeDisabled();
  });

  it("disables reset when the values already equal the defaults", () => {
    render(
      <FloatBarSettingsSection settings={settings()} saving={false} set={vi.fn()} />,
    );

    expect(screen.getByText("FloatBarResetBackground")).toBeDisabled();
  });
});
