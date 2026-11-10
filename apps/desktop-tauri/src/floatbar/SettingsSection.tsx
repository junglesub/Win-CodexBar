import { Field, SettingSelect, SettingToggle, Toggle, type SettingsControl } from "../components/FormControls";
import { useDraftNumber } from "../hooks/useDraftNumber";
import { useLocale } from "../hooks/useLocale";

const DEFAULT_BACKGROUND_COLOR = "#FFFFFF";
const DEFAULT_BACKGROUND_OPACITY = 8;
const NO_BATTERY_SLOTS_SENTINEL = "none";

const BATTERY_SLOT_OPTIONS = [
  { value: "5h", labelKey: "PanelFiveHours" },
  { value: "weekly", labelKey: "ProviderWeeklyLabel" },
  { value: "monthly", labelKey: "FloatBarBatterySlotMonthly" },
  { value: "fallback", labelKey: "FloatBarBatterySlotFallback" },
] as const;
type BatterySlot = (typeof BATTERY_SLOT_OPTIONS)[number]["value"];

function isBatterySlot(value: string): value is BatterySlot {
  return BATTERY_SLOT_OPTIONS.some((option) => option.value === value);
}

/**
 * Settings UI block for the floating capacity bar. Rendered as one row
 * in the Display tab — kept in this module so the Display tab only
 * imports a single component.
 */
export default function FloatBarSettingsSection({ settings, saving, set }: SettingsControl) {
  const { t } = useLocale();
  const ctl = { settings, set, saving };
  const opacity = useDraftNumber(settings.floatBarOpacity);
  const scale = useDraftNumber(settings.floatBarScale);
  const commitOpacity = () => {
    opacity.commit(opacity.draft, (value) => set({ floatBarOpacity: value }));
  };
  const commitScale = () => {
    scale.commit(scale.draft, (value) => set({ floatBarScale: value }));
  };
  const backgroundOpacity = useDraftNumber(settings.floatBarBackgroundOpacity);
  const commitBackgroundOpacity = () => {
    backgroundOpacity.commit(backgroundOpacity.draft, (value) =>
      set({ floatBarBackgroundOpacity: value }),
    );
  };
  const storedBatterySlots = settings.floatBarBatterySlots ?? [];
  const batteryLowPercent = useDraftNumber(settings.floatBarBatteryLowPercent ?? -1);
  const commitBatteryLowPercent = () => {
    const raw = batteryLowPercent.draft;
    const parsed = Number.isFinite(raw) ? Math.round(raw) : -1;
    // -1 disables the fallback; anything below clamps to -1, above to 100.
    const next = parsed < 0 ? -1 : Math.min(100, parsed);
    batteryLowPercent.commit(next, (value) => set({ floatBarBatteryLowPercent: value }));
  };
  const selectedBatterySlots = new Set(storedBatterySlots.filter(isBatterySlot));
  const allBatterySlots = storedBatterySlots.length === 0;
  const batterySlotsDisabled =
    saving || !settings.floatBarEnabled || !settings.floatBarBatteryStyle;
  const toggleBatterySlot = (slot: BatterySlot, checked: boolean) => {
    const next = new Set(
      allBatterySlots ? BATTERY_SLOT_OPTIONS.map((option) => option.value) : selectedBatterySlots,
    );
    if (checked) next.add(slot);
    else next.delete(slot);
    const values = BATTERY_SLOT_OPTIONS
      .map((option) => option.value)
      .filter((value) => next.has(value));
    // Empty means "all" for backwards compatibility, so retain an unknown
    // marker when the user intentionally clears every checkbox.
    set({
      floatBarBatterySlots: values.length > 0 ? values : [NO_BATTERY_SLOTS_SENTINEL],
    });
  };

  return (
    <section className="settings-section">
      <h3 className="settings-section__title">{t("FloatBarSectionTitle")}</h3>
      <div className="settings-section__group">
        <SettingToggle
          ctl={ctl}
          field="floatBarEnabled"
          label={t("FloatBarShowFloatingBar")}
          description={t("FloatBarShowFloatingBarHelper")}
        />
        <SettingSelect
          ctl={ctl}
          field="floatBarOrientation"
          label={t("FloatBarOrientation")}
          description={t("FloatBarOrientationHelper")}
          disabled={saving || !settings.floatBarEnabled}
          options={[
            { value: "horizontal", label: t("FloatBarOrientationHorizontal") },
            { value: "vertical", label: t("FloatBarOrientationVertical") },
          ]}
        />
        <SettingSelect
          ctl={ctl}
          field="floatBarStyle"
          label={t("FloatBarStyle")}
          description={t("FloatBarStyleHelper")}
          disabled={saving || !settings.floatBarEnabled}
          options={[
            { value: "floating", label: t("FloatBarStyleFloating") },
            { value: "taskbar", label: t("FloatBarStyleTaskbar") },
          ]}
        />
        <Field
          label={`${t("FloatBarOpacity")} (${opacity.draft}%)`}
          description={t("FloatBarOpacityHelper")}
        >
          <input
            type="range"
            min={30}
            max={100}
            step={5}
            value={opacity.draft}
            disabled={!settings.floatBarEnabled}
            onChange={(e) => opacity.setDraft(Number(e.target.value))}
            onPointerUp={commitOpacity}
            onTouchEnd={commitOpacity}
            onBlur={commitOpacity}
            onKeyUp={commitOpacity}
            aria-label={t("FloatBarOpacityAriaLabel")}
          />
        </Field>
        <Field label={t("FloatBarBackgroundColor")}>
          <input
            type="color"
            value={settings.floatBarBackgroundColor}
            disabled={saving || !settings.floatBarEnabled}
            onChange={(e) =>
              set({ floatBarBackgroundColor: e.target.value.toUpperCase() })
            }
            aria-label={t("FloatBarBackgroundColor")}
          />
        </Field>
        <Field
          label={`${t("FloatBarBackgroundOpacity")} (${backgroundOpacity.draft}%)`}
        >
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={backgroundOpacity.draft}
            disabled={saving || !settings.floatBarEnabled}
            onChange={(e) => backgroundOpacity.setDraft(Number(e.target.value))}
            onPointerUp={commitBackgroundOpacity}
            onTouchEnd={commitBackgroundOpacity}
            onBlur={commitBackgroundOpacity}
            onKeyUp={commitBackgroundOpacity}
            aria-label={t("FloatBarBackgroundOpacity")}
          />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={
              saving ||
              !settings.floatBarEnabled ||
              (settings.floatBarBackgroundColor === DEFAULT_BACKGROUND_COLOR &&
                settings.floatBarBackgroundOpacity === DEFAULT_BACKGROUND_OPACITY)
            }
            onClick={() =>
              set({
                floatBarBackgroundColor: DEFAULT_BACKGROUND_COLOR,
                floatBarBackgroundOpacity: DEFAULT_BACKGROUND_OPACITY,
              })
            }
          >
            {t("FloatBarResetBackground")}
          </button>
        </Field>
        <Field
          label={`${t("FloatBarSize")} (${scale.draft}%)`}
          description={t("FloatBarSizeHelper")}
        >
          <input
            type="range"
            min={75}
            max={200}
            step={5}
            value={scale.draft}
            disabled={!settings.floatBarEnabled}
            onChange={(e) => scale.setDraft(Number(e.target.value))}
            onPointerUp={commitScale}
            onTouchEnd={commitScale}
            onBlur={commitScale}
            onKeyUp={commitScale}
            aria-label={t("FloatBarSizeAriaLabel")}
          />
        </Field>
        <SettingToggle
          ctl={ctl}
          field="floatBarShowCost"
          label={t("FloatBarShowCost")}
          description={t("FloatBarShowCostDescription")}
          disabled={saving || !settings.floatBarEnabled}
        />
        <SettingToggle
          ctl={ctl}
          field="floatBarShowResetInline"
          label={t("FloatBarShowResetInline")}
          description={t("FloatBarShowResetInlineHelper")}
          disabled={saving || !settings.floatBarEnabled}
        />
        <SettingToggle
          ctl={ctl}
          field="floatBarShowWeekly"
          label={t("FloatBarShowWeekly")}
          description={t("FloatBarShowWeeklyHelper")}
          disabled={saving || !settings.floatBarEnabled}
        />
        <SettingToggle
          ctl={ctl}
          field="floatBarHidePercentWhenExhausted"
          label={t("FloatBarHidePercentWhenExhausted")}
          description={t("FloatBarHidePercentWhenExhaustedHelper")}
          disabled={saving || !settings.floatBarEnabled}
        />
        <SettingToggle
          ctl={ctl}
          field="floatBarBatteryStyle"
          label={t("FloatBarBatteryStyleLabel")}
          description={t("FloatBarBatteryStyleHelper")}
          disabled={saving || !settings.floatBarEnabled}
        />
        <Field
          label={t("FloatBarBatterySlotsLabel")}
          description={t("FloatBarBatterySlotsHelper")}
        >
          <div
            className="floatbar__battery-slots"
            role="group"
            aria-label={t("FloatBarBatterySlotsLabel")}
          >
            {BATTERY_SLOT_OPTIONS.map((option) => (
              <label className="floatbar__battery-slot" key={option.value}>
                <input
                  type="checkbox"
                  checked={allBatterySlots || selectedBatterySlots.has(option.value)}
                  disabled={batterySlotsDisabled}
                  aria-label={t(option.labelKey)}
                  onChange={(event) => toggleBatterySlot(option.value, event.target.checked)}
                />
                <span>{t(option.labelKey)}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field
          label={t("FloatBarBatteryLowPercentLabel")}
          description={t("FloatBarBatteryLowPercentHelper")}
        >
          <input
            type="number"
            min={-1}
            max={100}
            step={1}
            value={batteryLowPercent.draft}
            disabled={batterySlotsDisabled}
            onChange={(e) =>
              batteryLowPercent.setDraft(e.target.value === "" ? -1 : Number(e.target.value))
            }
            onBlur={commitBatteryLowPercent}
            onKeyUp={commitBatteryLowPercent}
            aria-label={t("FloatBarBatteryLowPercentLabel")}
          />
        </Field>
        <SettingToggle
          ctl={ctl}
          field="floatBarPaceTextColor"
          label={t("FloatBarPaceTextColorLabel")}
          description={t("FloatBarPaceTextColorHelper")}
          disabled={saving || !settings.floatBarEnabled}
        />
        <SettingToggle
          ctl={ctl}
          field="floatBarPaceTimeDelta"
          label={t("FloatBarPaceTimeDeltaLabel")}
          description={t("FloatBarPaceTimeDeltaHelper")}
          disabled={saving || !settings.floatBarEnabled}
        />
        <SettingToggle
          ctl={ctl}
          field="floatBarShowRemaining"
          label={t("FloatBarShowRemainingLabel")}
          description={t("FloatBarShowRemainingHelper")}
          disabled={saving || !settings.floatBarEnabled}
        />
        <SettingToggle
          ctl={ctl}
          field="floatBarFollowProviderOrder"
          label={t("FloatBarFollowProviderOrderLabel")}
          description={t("FloatBarFollowProviderOrderHelper")}
          disabled={saving || !settings.floatBarEnabled}
        />
        <Field
          label={t("FloatBarExhaustedClockTime")}
          description={t("FloatBarExhaustedClockTimeHelper")}
          leading
        >
          <Toggle
            checked={settings.floatBarExhaustedClockTime}
            disabled={
              saving || !settings.floatBarEnabled || !settings.floatBarHidePercentWhenExhausted
            }
            ariaLabel={t("FloatBarExhaustedClockTime")}
            onChange={(v) => set({ floatBarExhaustedClockTime: v })}
          />
        </Field>
        <Field
          label={t("FloatBarExhaustedWeekdayTime")}
          description={t("FloatBarExhaustedWeekdayTimeHelper")}
          leading
        >
          <Toggle
            checked={settings.floatBarExhaustedWeekdayTime}
            disabled={saving || !settings.floatBarEnabled || !settings.floatBarExhaustedClockTime}
            ariaLabel={t("FloatBarExhaustedWeekdayTime")}
            onChange={(v) => set({ floatBarExhaustedWeekdayTime: v })}
          />
        </Field>
        <SettingToggle
          ctl={ctl}
          field="floatBarDarkText"
          label={t("FloatBarInvertColors")}
          description={t("FloatBarInvertColorsHelper")}
          disabled={saving || !settings.floatBarEnabled}
        />
        <SettingToggle
          ctl={ctl}
          field="floatBarClickThrough"
          label={t("FloatBarClickThrough")}
          description={t("FloatBarClickThroughHelper")}
          disabled={saving || !settings.floatBarEnabled}
        />
      </div>
    </section>
  );
}
