# Float Bar Three-Window Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Float Bar's unexplained single quota number with fixed 5-hour, weekly, and monthly usage slots.

**Architecture:** Keep cadence classification and slot rendering inside the existing Float Bar module. Reuse the provider snapshot's canonical windows, labels, `windowMinutes`, and the existing live reset formatter; do not change backend or bridge contracts.

**Tech Stack:** React 18, TypeScript, Vitest 3, Testing Library, existing Tauri frontend APIs

**Spec:** `docs/superpowers/specs/2026-08-18-float-bar-three-window-usage-design.md`

## Global Constraints

- Visible slot order is always `5h / weekly / monthly`.
- Values are always consumed percentages; `showAsUsed` does not apply.
- Only `primary`, `secondary`, and `tertiary` participate in cadence classification.
- Cadence-less providers (all three slots empty) render one visibly labeled fallback metric honoring the per-provider `providerMetrics` preference; automatic uses `modelSpecific` → `primary` → `secondary` → `tertiary`.
- No backend, bridge, settings-schema, dependency, extra-window, cost, or local-estimate changes.
- Missing or informational quotas render as `—`.
- Do not run a build or CUA proof without separate user authorization.

---

### Task 1: Lock cadence selection and risk behavior with tests

**Files:**
- Modify: `apps/desktop-tauri/src/floatbar/FloatBar.test.tsx`
- Modify: `apps/desktop-tauri/src/floatbar/FloatBar.tsx`

**Interfaces:**
- Consumes: `ProviderUsageSnapshot`, `RateWindowSnapshot`
- Produces: local `UsageCadence`, `UsageSlots`, `selectFloatBarUsageSlots(provider)`, and `maxFloatBarUsedPercent(provider)` helpers in `FloatBar.tsx`

- [ ] **Step 1: Extend the test fixture to describe real cadences**

Add `windowMinutes` to `RateWindowOptions`, pass it through `rateWindow`, and let `snapshot` accept primary/secondary/tertiary labels and windows. Keep the common fixture realistic by defaulting its primary to a 300-minute window and its secondary to a 10,080-minute window when present.

```tsx
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
```

- [ ] **Step 2: Write failing rendering and classification tests**

Add focused cases that assert visible `.floatbar__metric` text and slot order:

```tsx
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
```

Also add cases for a monthly window classified from `secondaryLabel: "Monthly"` when duration is absent, a known unsupported duration refusing label fallback, duplicate cadence candidates keeping the first match, provider errors rendering three dashes, and sorting/tone using the highest recognized percentage.

- [ ] **Step 3: Run the focused tests and confirm failure**

Run from `apps/desktop-tauri`:

```powershell
pnpm test -- src/floatbar/FloatBar.test.tsx
```

Expected: FAIL because `.floatbar__metric` and three-slot selection do not exist.

- [ ] **Step 4: Implement the smallest local cadence selector**

In `FloatBar.tsx`, remove the `selectSingleMetricUsageWindow` import and add local types and pure helpers. A known duration always wins; label fallback is allowed only when duration is absent.

```tsx
type UsageCadence = "5h" | "weekly" | "monthly";
type UsageSlots = Record<UsageCadence, RateWindowSnapshot | null>;

const USAGE_CADENCES: readonly UsageCadence[] = ["5h", "weekly", "monthly"];

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
    const cadence = window.windowMinutes == null
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
```

Import `RateWindowSnapshot` as a TypeScript type. Use `maxFloatBarUsedPercent` for provider sorting. Color each displayed metric independently from its own percentage using the existing warning/critical thresholds; the pill stays neutral. Preserve critical status for provider errors.

- [ ] **Step 5: Run the focused tests**

```powershell
pnpm test -- src/floatbar/FloatBar.test.tsx
```

Expected: classification, ordering, error, and tone tests PASS.

- [ ] **Step 6: Commit the classification slice**

```powershell
git add apps/desktop-tauri/src/floatbar/FloatBar.tsx apps/desktop-tauri/src/floatbar/FloatBar.test.tsx
git commit -m "Show Float Bar usage windows"
```

---

### Task 2: Render percentages and per-slot single-unit reset countdowns

**Files:**
- Modify: `apps/desktop-tauri/src/floatbar/FloatBar.tsx`
- Modify: `apps/desktop-tauri/src/floatbar/FloatBar.test.tsx`

**Interfaces:**
- Consumes: `UsageCadence`, `UsageSlots`, `useFormattedResetTime`, `compactResetTime`
- Produces: local `UsageMetric` component with `{ window, providerError, showResetInline }` props

- [ ] **Step 1: Write failing countdown and accessibility tests**

Use fake timers with a fixed system time. Cover the representative mixed display:

```tsx
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

  expect(
    Array.from(container.querySelectorAll(".floatbar__metric"), (node) => node.textContent),
  ).toEqual(["100% 30m", "41% 1h", "60% 1d"]);
  expect(container.querySelector(".floatbar__pill")?.getAttribute("aria-label"))
    .toMatch(/weekly: 41% used\nResets in 1h 30m/);
});
```

Add cases proving that all valid future resets append a single largest-unit countdown beside their percentages (floor semantics: `30m`, `1h` for 90 minutes, `1d` for 36 hours; never combined units), invalid/expired/absent timestamps leave percentages visible, disabling inline reset leaves percentages visible, and tooltip/accessibility text retains cadence, percentage, and the full localized reset. Add `afterEach(() => vi.useRealTimers())` to prevent timer leakage.

- [ ] **Step 2: Run the countdown tests and verify failure**

```powershell
pnpm test -- src/floatbar/FloatBar.test.tsx
```

Expected: FAIL because slots do not independently format or append their values.

- [ ] **Step 3: Add the fixed three-slot renderer**

Create a child component so every fixed slot can safely compute its compact reset. Pass the raw timestamp because the appended countdown must never derive from localized prose.

```tsx
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

function UsageMetric({
  window: rateWindow,
  providerError,
  showResetInline,
}: {
  window: RateWindowSnapshot | null;
  providerError: boolean;
  showResetInline: boolean;
}) {
  const used = rateWindow ? Math.max(0, Math.min(100, rateWindow.usedPercent)) : null;
  const target = rateWindow?.resetsAt ? Date.parse(rateWindow.resetsAt) : Number.NaN;
  const hasFutureReset = Number.isFinite(target) && target > Date.now();
  const compactReset =
    hasFutureReset && rateWindow?.resetsAt ? compactResetTime(rateWindow.resetsAt) : null;
  const visible =
    used == null || providerError
      ? "—"
      : `${Math.round(used)}%${showResetInline && compactReset ? ` ${compactReset}` : ""}`;

  return (
    <span className="floatbar__metric" data-tauri-drag-region>
      {visible}
    </span>
  );
}
```

In `ProviderPill`, compute the slots and render three metrics with separators. The full per-slot detail (cadence, used percentage, localized reset) lives on the pill `title` and `aria-label`. Remove the obsolete single-window, remaining-percentage, reset-icon, and per-metric detail paths while preserving the icon, brand, drag behavior, and tone classes.

Import `Fragment` from React. Remove unused props only from Float Bar call sites; do not delete global settings or translation keys used elsewhere.

- [ ] **Step 4: Apply minimal slot styling**

```css
.floatbar__metrics {
  display: inline-flex;
  align-items: center;
  gap: calc(3px * var(--floatbar-scale, 1));
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.floatbar__metric {
  min-width: 2.4em;
  text-align: center;
}
.floatbar__metric-separator {
  opacity: 0.55;
}
.floatbar--vertical .floatbar__metrics {
  flex-direction: column;
  gap: calc(1px * var(--floatbar-scale, 1));
}
.floatbar--vertical .floatbar__metric-separator {
  display: none;
}
```

Delete CSS selectors made unused by removing the reset icon and appended reset block.

- [ ] **Step 5: Update existing single-number tests**

Replace title assertions for one effective metric with three-slot assertions. Remove the obsolete expectation that Float Bar follows `showAsUsed`; assert that `showAsUsed: false` still renders consumed percentages. Preserve coverage for provider filters, cost pills, dragging, scaling, resizing, settings updates, and refresh timing.

- [ ] **Step 6: Run the complete Float Bar test file**

```powershell
pnpm test -- src/floatbar/FloatBar.test.tsx
```

Expected: all Float Bar tests PASS with no timer leaks or React act warnings.

- [ ] **Step 7: Commit the rendering slice**

```powershell
git add apps/desktop-tauri/src/floatbar/FloatBar.tsx apps/desktop-tauri/src/floatbar/FloatBar.css apps/desktop-tauri/src/floatbar/FloatBar.test.tsx
git commit -m "Show Float Bar reset countdowns"
```

---

### Task 3: Document and verify the shipped behavior

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Verify: `apps/desktop-tauri/src/floatbar/FloatBar.tsx`
- Verify: `apps/desktop-tauri/src/floatbar/FloatBar.test.tsx`

**Interfaces:**
- Consumes: completed Float Bar behavior from Tasks 1 and 2
- Produces: current architecture documentation and final frontend verification evidence

- [ ] **Step 1: Update the existing Float Bar data-flow paragraph**

Extend `docs/ARCHITECTURE.md` section `Data flow > Float bar` with:

```markdown
The provider pill reads canonical `primary`, `secondary`, and `tertiary` rate windows and renders fixed 5-hour / weekly / monthly positions. Values are consumed percentages; missing or informational windows render as `—`. When inline resets are enabled, a slot with a valid future reset appends a compact countdown using only its largest unit (`m`, `h`, or `d`) beside the percentage. Each displayed metric colors itself from its own percentage while the pill stays neutral; sorting follows the highest recognized usage value. Cost and extra rate windows remain separate from these quota positions; `modelSpecific` is used only as the single cadence-less fallback metric.
```

- [ ] **Step 2: Run focused frontend verification**

From `apps/desktop-tauri`:

```powershell
pnpm test -- src/floatbar/FloatBar.test.tsx src/lib/usageWindows.test.ts
```

Expected: both test files PASS. The shared single-metric helper remains unchanged for other surfaces.

- [ ] **Step 3: Inspect the diff for accidental scope expansion**

```powershell
git diff --check
git diff -- apps/desktop-tauri/src/floatbar docs/ARCHITECTURE.md
```

Expected: no whitespace errors and no backend, bridge, settings, dependency, lockfile, model-specific, extra-window, or cost changes.

- [ ] **Step 4: Record deferred Windows proof**

Use this exact handoff note:

```text
Build and CUA proof were not run because the repository instruction requires explicit user authorization before building. Run a fresh desktop build followed by the documented CUA Float Bar proof loop when build authorization is provided.
```

- [ ] **Step 5: Commit documentation**

```powershell
git add docs/ARCHITECTURE.md
git commit -m "Document Float Bar usage windows"
```
