import { useId } from "react";

import type { AgentKind } from "../../shared/protocol.ts";
import { useT } from "../lib/i18n.ts";

export function AgentProfilePicker({ agent, value, disabled, onChange }: { agent: AgentKind | undefined; value: string; disabled: boolean; onChange: (id: string) => void }) {
  const t = useT();
  const id = useId();
  if (!agent?.profiles?.length) return null;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{t("Profile")}</label>
      <select id={id} className="input" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="" disabled={agent.installed === false}>{t("Default")}</option>
        {agent.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
      </select>
      {agent.installed === false && !value && <span className="field-hint">{t("Choose a profile to start {agent} on this PC.", { agent: agent.label })}</span>}
    </div>
  );
}
