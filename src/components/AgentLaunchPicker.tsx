import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import type { AgentKind, SavedAgentLauncher } from "../../shared/protocol.ts";
import { useT } from "../lib/i18n.ts";
import { useMachineApi } from "../lib/machineContext.tsx";
import { userErrorMessage } from "../lib/userError.ts";
import "./AgentLaunchPicker.css";

interface Props {
  agent: AgentKind | undefined;
  profile: string;
  launcher: string;
  disabled: boolean;
  onProfileChange: (id: string) => void;
  onLauncherChange: (id: string) => void;
  onLaunchersChange: (launchers: SavedAgentLauncher[], selected: string) => void;
  onEditingChange: (editing: boolean) => void;
}

export function AgentLaunchPicker({ agent, profile, launcher, disabled, onProfileChange, onLauncherChange, onLaunchersChange, onEditingChange }: Props) {
  const t = useT();
  const id = useId();
  const { fetchSavedLaunchers, saveAgentLauncher, deleteAgentLauncher } = useMachineApi();
  const [editor, setEditor] = useState<{ id?: string; label: string; executable: string; args: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const nameField = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const returnToAdd = useRef(false);
  const selected = agent?.launchers?.find((choice) => choice.id === launcher);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => { onEditingChange(editor !== null || busy); }, [editor, busy, onEditingChange]);
  useLayoutEffect(() => { if (editor) nameField.current?.focus({ preventScroll: true }); }, [editor?.id, editor !== null]);
  useLayoutEffect(() => {
    if (returnToAdd.current && !editor && !busy) {
      returnToAdd.current = false;
      addButton.current?.focus({ preventScroll: true });
    }
  }, [editor, busy]);

  const closeEditor = (): void => {
    setEditor(null);
    setError(null);
    returnToAdd.current = true;
  };
  const edit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setConfirmDelete(false);
    try {
      const definitions = await fetchSavedLaunchers();
      if (!active.current) return;
      const found = definitions.find((entry) => entry.id === launcher && entry.kind === agent?.kind);
      if (!found) {
        onLaunchersChange(definitions, "");
        setError(t("This launcher was removed. Choose another launcher or add it again."));
      } else setEditor(found);
    } catch (reason) { if (active.current) setError(userErrorMessage(reason).detail ?? userErrorMessage(reason).message); }
    finally { if (active.current) setBusy(false); }
  };
  const save = async (): Promise<void> => {
    if (!agent || !editor || busy || disabled || !editor.label.trim() || !editor.executable.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const definitions = await saveAgentLauncher({ kind: agent.kind, label: editor.label, executable: editor.executable, args: editor.args }, editor.id);
      if (!active.current) return;
      onLaunchersChange(definitions, editor.id ?? definitions.at(-1)!.id);
      closeEditor();
    } catch (reason) { if (active.current) setError(userErrorMessage(reason).detail ?? userErrorMessage(reason).message); }
    finally { if (active.current) setBusy(false); }
  };
  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const definitions = await deleteAgentLauncher(launcher);
      if (!active.current) return;
      onLaunchersChange(definitions, "");
      setConfirmDelete(false);
      returnToAdd.current = true;
    } catch (reason) { if (active.current) setError(userErrorMessage(reason).detail ?? userErrorMessage(reason).message); }
    finally { if (active.current) setBusy(false); }
  };
  return <>
    {(agent?.saved_launchers || Boolean(agent?.launchers?.length)) && <div className="field">
      <label className="field-label" htmlFor={`${id}-launcher`}>{t("Launcher")}</label>
      <select id={`${id}-launcher`} className="input" value={launcher} disabled={disabled || busy || editor !== null} onChange={(event) => { setConfirmDelete(false); setError(null); onLauncherChange(event.target.value); }}>
        <option value="" disabled={agent?.installed === false}>{t("Default")}</option>
        {agent?.launchers?.filter((choice) => !choice.saved).map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
        {agent?.launchers?.some((choice) => choice.saved) && <optgroup label={t("Saved launchers")}>
          {agent.launchers.filter((choice) => choice.saved).map((choice) => <option key={choice.id} value={choice.id}>{choice.label}{agent.launchers!.some((other) => other.saved && other.id !== choice.id && other.label === choice.label) ? ` · ${choice.id.slice(-8)}` : ""}</option>)}
        </optgroup>}
      </select>
      {agent?.installed === false && !launcher && <span className="field-hint">{t("Choose a launcher to start {agent} on this PC.", { agent: agent.label })}</span>}
      {agent?.saved_launchers && <>
        {!editor && <div className="launcher-actions">
          <button ref={addButton} type="button" className="btn btn-ghost" disabled={disabled || busy} onClick={() => { setConfirmDelete(false); setError(null); setEditor({ label: "", executable: "", args: [] }); }}>{t("Add launcher")}</button>
          {selected?.saved && <>
            <button type="button" className="btn btn-ghost" disabled={disabled || busy} onClick={() => void edit()}>{t("Edit")}</button>
            <button type="button" className={confirmDelete ? "btn btn-danger" : "btn btn-ghost"} disabled={disabled || busy} onClick={() => { if (confirmDelete) void remove(); else setConfirmDelete(true); }}>{t(confirmDelete ? "Delete launcher?" : "Delete")}</button>
            {confirmDelete && <button type="button" className="btn btn-ghost" disabled={disabled || busy} onClick={() => setConfirmDelete(false)}>{t("Cancel")}</button>}
          </>}
        </div>}
        {editor && <fieldset className="launcher-editor" onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) { event.stopPropagation(); return; }
          if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); void save(); }
        }}>
          <legend className="field-label">{t(editor.id ? "Edit launcher" : "Add launcher")}</legend>
          <p className="field-hint">{t("Saved on this PC for future launches. Existing panes keep running.")}</p>
          <label className="field-label" htmlFor={`${id}-name`}>{t("Launcher name")}</label>
          <input ref={nameField} id={`${id}-name`} className="input" disabled={disabled || busy} value={editor.label} onChange={(event) => setEditor({ ...editor, label: event.target.value })} />
          <label className="field-label" htmlFor={`${id}-executable`}>{t("Executable")}</label>
          <input id={`${id}-executable`} className="input" disabled={disabled || busy} value={editor.executable} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => setEditor({ ...editor, executable: event.target.value })} />
          <p className="field-hint">{t("Executable name on PATH or an absolute path on this PC. Saving does not install or run it.")}</p>
          {editor.args.map((arg, index) => <div className="field" key={index}>
            <label className="field-label" htmlFor={`${id}-arg-${index}`}>{t("Argument {number}", { number: index + 1 })}</label>
            <div className="launcher-argument">
              <input id={`${id}-arg-${index}`} className="input" disabled={disabled || busy} value={arg} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => setEditor({ ...editor, args: editor.args.map((word, at) => at === index ? event.target.value : word) })} />
              <button type="button" className="btn btn-ghost" disabled={disabled || busy} aria-label={t("Remove argument {number}", { number: index + 1 })} onClick={() => { setEditor({ ...editor, args: editor.args.filter((_, at) => at !== index) }); nameField.current?.focus({ preventScroll: true }); }}>{t("Remove")}</button>
            </div>
          </div>)}
          <p className="field-hint">{t("Each argument is one value. Spaces stay inside it; shell syntax is not expanded.")}</p>
          <div className="launcher-actions">
            <button type="button" className="btn btn-ghost" disabled={disabled || busy} onClick={() => setEditor({ ...editor, args: [...editor.args, ""] })}>{t("Add argument")}</button>
            <button type="button" className="btn btn-ghost" disabled={disabled || busy} onClick={closeEditor}>{t("Cancel launcher")}</button>
            <button type="button" className="btn btn-primary" disabled={disabled || busy || !editor.label.trim() || !editor.executable.trim()} onClick={() => void save()}>{t("Save launcher")}</button>
          </div>
        </fieldset>}
        {busy && <span className="field-hint" role="status">{t("Updating launchers…")}</span>}
        {error && <p className="launcher-error" role="alert">{error}</p>}
      </>}
    </div>}
    {!launcher && Boolean(agent?.profiles?.length) && <div className="field">
      <label className="field-label" htmlFor={`${id}-profile`}>{t("Profile")}</label>
      <select id={`${id}-profile`} className="input" value={profile} disabled={disabled || busy || editor !== null || agent?.installed === false} onChange={(event) => onProfileChange(event.target.value)}>
        <option value="">{t("Default")}</option>
        {agent?.profiles?.map((choice) => <option key={choice.id} value={choice.id}>{choice.id}</option>)}
      </select>
    </div>}
  </>;
}
