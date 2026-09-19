import type { PaceSnapshot } from "../../../../types/bridge";
import type { LocaleKey } from "../../../../i18n/keys";
import { formatEta } from "../../../../lib/formatEta";

export interface PaceLane {
  label: string | null;
  pace: PaceSnapshot;
}

interface Props {
  /** Personal-only: one entry per lane with data (5h / weekly / monthly). */
  lanes: PaceLane[];
  t: (key: LocaleKey) => string;
}

const STAGE_TO_KEY: Record<PaceSnapshot["stage"], LocaleKey> = {
  on_track: "DetailPaceOnTrack",
  slightly_ahead: "DetailPaceSlightlyAhead",
  ahead: "DetailPaceAhead",
  far_ahead: "DetailPaceFarAhead",
  slightly_behind: "DetailPaceSlightlyBehind",
  behind: "DetailPaceBehind",
  far_behind: "DetailPaceFarBehind",
};

/** 展示配额节奏状态及其辅助说明。 */
export function PaceSection({ lanes, t }: Props) {
  const visible = lanes.filter((lane) => lane.pace != null);
  if (visible.length === 0) return null;
  const showLabels = visible.length > 1;

  return (
    <section className="provider-detail-section provider-detail-pace">
      <h4>{t("DetailPaceTitle")}</h4>
      {visible.map((lane) => {
        const stageLabel = t(STAGE_TO_KEY[lane.pace.stage]);
        const aux = lane.pace.willLastToReset
          ? t("DetailPaceWillLastToReset")
          : lane.pace.etaSeconds !== null
            ? `${t("DetailPaceRunsOutIn")} ${formatEta(lane.pace.etaSeconds)}`
            : null;
        return (
          <div className="provider-detail-pace__lane" key={lane.label ?? "primary"}>
            <div className="provider-detail-pace__stage" data-stage={lane.pace.stage}>
              {showLabels && lane.label ? `${lane.label} · ` : null}
              {stageLabel}
            </div>
            {aux && <div className="provider-detail-pace__aux">{aux}</div>}
          </div>
        );
      })}
    </section>
  );
}
