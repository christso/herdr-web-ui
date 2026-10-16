import { useId } from "react";

import type { AgentKind } from "../../shared/protocol.ts";
import { useT } from "../lib/i18n.ts";

export function AgentLaunchPicker({ agent, profile, launcher, disabled, onProfileChange, onLauncherChange }: { agent: AgentKind | undefined; profile: string; launcher: string; disabled: boolean; onProfileChange: (id: string) => void; onLauncherChange: (id: string) => void }) {
  const t = useT();
  const id = useId();
  return <>
    {Boolean(agent?.launchers?.length) && <div className="field">
      <label className="field-label" htmlFor={`${id}-launcher`}>{t("Launcher")}</label>
      <select id={`${id}-launcher`} className="input" value={launcher} disabled={disabled} onChange={(event) => onLauncherChange(event.target.value)}>
        <option value="" disabled={agent?.installed === false}>{t("Default")}</option>
        {agent?.launchers?.map((choice) => <option key={choice.id} value={choice.id}>{choice.id}</option>)}
      </select>
      {agent?.installed === false && !launcher && <span className="field-hint">{t("Choose a launcher to start {agent} on this PC.", { agent: agent.label })}</span>}
    </div>}
    {!launcher && Boolean(agent?.profiles?.length) && <div className="field">
      <label className="field-label" htmlFor={`${id}-profile`}>{t("Profile")}</label>
      <select id={`${id}-profile`} className="input" value={profile} disabled={disabled || agent?.installed === false} onChange={(event) => onProfileChange(event.target.value)}>
        <option value="">{t("Default")}</option>
        {agent?.profiles?.map((choice) => <option key={choice.id} value={choice.id}>{choice.id}</option>)}
      </select>
    </div>}
  </>;
}
