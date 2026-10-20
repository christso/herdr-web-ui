import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import type { AgentKind, SavedAgentLauncher } from "../../shared/protocol.ts";
import { useT } from "../lib/i18n.ts";
import { useMachineApi } from "../lib/machineContext.tsx";
import { useAnnouncedText } from "../lib/useAnnouncedText.ts";
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
  const { fetchSavedLaunchers, saveAgentLauncher, deleteAgentLauncher, searchLauncherExecutables } = useMachineApi();
  const [editor, setEditor] = useState<{ id?: string; label: string; executable: string; args: string[] } | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});
  const searchRoot = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const nameField = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const returnToAdd = useRef(false);
  const selected = agent?.launchers?.find((choice) => choice.id === launcher);
  const searchMessage = open && !editor && query?.trim() ? t(searchState === "loading" ? "Searching executables…" : searchState === "error" ? "Could not search this PC. Enter an executable or try again." : searchState === "ready" && !suggestions.length ? "No matching executables. You can enter a command or full path." : "Select a launcher or use an executable, then save it.") : null;
  const announcedSearch = useAnnouncedText(searchMessage);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => { onEditingChange(editor !== null || busy || query !== null); }, [editor, busy, query, onEditingChange]);
  useLayoutEffect(() => { if (editor) nameField.current?.focus({ preventScroll: true }); }, [editor?.id, editor !== null]);
  useLayoutEffect(() => {
    if (returnToAdd.current && !editor && !busy) {
      returnToAdd.current = false;
      (searchField.current ?? addButton.current)?.focus({ preventScroll: true });
    }
  }, [editor, busy]);

  useEffect(() => {
    setSuggestions([]);
    if (!open || editor || !agent?.launcher_search || !query?.trim()) { setSearchState("idle"); return; }
    const abort = new AbortController();
    let current = true;
    setSearchState("loading");
    const timer = setTimeout(() => {
      void searchLauncherExecutables(query.trim(), abort.signal).then((names) => {
        if (current) { setSuggestions(names); setSearchState("ready"); }
      }, () => { if (current) setSearchState("error"); });
    }, 180);
    return () => { current = false; clearTimeout(timer); abort.abort(); };
  }, [query, open, editor !== null, agent?.launcher_search, searchLauncherExecutables]);

  useLayoutEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const measure = (): void => {
      if (!searchField.current) return;
      const rect = searchField.current.getBoundingClientRect();
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? window.innerHeight);
      const below = Math.max(0, bottom - rect.bottom - 16);
      const above = Math.max(0, rect.top - top - 16);
      const up = below < 160 && above > below;
      setPlace({ left: rect.left, width: rect.width, maxHeight: Math.min(280, up ? above : below), ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }) });
    };
    measure();
    viewport?.addEventListener("resize", measure);
    viewport?.addEventListener("scroll", measure);
    return () => { viewport?.removeEventListener("resize", measure); viewport?.removeEventListener("scroll", measure); };
  }, [open, query, searchState]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent): void => { if (!searchRoot.current?.contains(event.target as Node)) setOpen(false); };
    const move = (event: Event): void => {
      if (event.type === "resize" || (event.target instanceof Node && searchRoot.current && event.target.contains(searchRoot.current))) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("scroll", move, true);
    window.addEventListener("resize", move);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("scroll", move, true); window.removeEventListener("resize", move); };
  }, [open]);

  const label = (choice: NonNullable<AgentKind["launchers"]>[number]): string => choice.label + (choice.saved && agent?.launchers?.some((other) => other.saved && other.id !== choice.id && other.label === choice.label) ? ` · ${choice.id.slice(-8)}` : "");
  const prefix = query?.trim().toLocaleLowerCase() ?? "";
  const optionGroups = [
    { key: "default", label: null, options: !prefix || t("Default").toLocaleLowerCase().includes(prefix) ? [{ key: "default", text: t("Default"), selected: !launcher, disabled: agent?.installed === false, choose: () => { if (launcher) onLauncherChange(""); } }] : [] },
    { key: "legacy", label: null, options: (agent?.launchers ?? []).filter((choice) => !choice.saved && choice.label.toLocaleLowerCase().includes(prefix)).map((choice) => ({ key: choice.id, text: label(choice), selected: launcher === choice.id, disabled: false, choose: () => { if (launcher !== choice.id) onLauncherChange(choice.id); } })) },
    { key: "saved", label: t("Saved launchers"), options: (agent?.launchers ?? []).filter((choice) => choice.saved && choice.label.toLocaleLowerCase().includes(prefix)).map((choice) => ({ key: choice.id, text: label(choice), selected: launcher === choice.id, disabled: false, choose: () => { if (launcher !== choice.id) onLauncherChange(choice.id); } })) },
    { key: "executables", label: t("Executables · opens editor"), options: suggestions.map((name) => ({ key: `executable:${name}`, text: name, selected: false, disabled: false, choose: () => setEditor({ label: name, executable: name, args: [] }) })) },
    { key: "typed", label: null, options: query?.trim() ? [{ key: "typed", text: t("Use executable: {command}", { command: query.trim() }), selected: false, disabled: false, choose: () => setEditor({ label: query.trim().split("/").at(-1) || query.trim(), executable: query.trim(), args: [] }) }] : [] },
  ];
  const options = optionGroups.flatMap((group) => group.options);
  // If a row disappears, return to the typed command or current selection, never its old index.
  const highlighted = options.find((option) => option.key === highlightedKey)
    ?? options.find((option) => query === null ? option.selected : option.key === "typed") ?? options[0];
  const highlight = highlighted ? options.indexOf(highlighted) : -1;
  const choose = (index: number): void => {
    const option = options[index];
    if (!option || option.disabled) return;
    option.choose(); setOpen(false); setQuery(null); setSuggestions([]); setConfirmDelete(false); setError(null);
  };
  const cancelSearch = (): void => { setOpen(false); setQuery(null); setSuggestions([]); };
  useEffect(() => { if (open) setHighlightedKey(options[query === null ? Math.max(0, options.findIndex((option) => option.selected)) : 0]?.key ?? null); }, [query, open]);
  useEffect(() => {
    if (!open) return;
    const option = document.getElementById?.(`${id}-choice-${highlight}`), menu = option?.closest<HTMLElement>(".launcher-choices");
    if (!option || !menu) return;
    const row = option.getBoundingClientRect(), bounds = menu.getBoundingClientRect();
    if (row.top < bounds.top) menu.scrollTop -= bounds.top - row.top;
    else if (row.bottom > bounds.bottom) menu.scrollTop += row.bottom - bounds.bottom;
  }, [highlight, open]);

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
    <span className="visually-hidden launcher-search-announcement" role="status">{announcedSearch}</span>
    {(agent?.saved_launchers || Boolean(agent?.launchers?.length)) && <div className="field">
      <label className="field-label" htmlFor={`${id}-launcher`}>{t("Launcher")}</label>
      {agent?.launcher_search ? <div ref={searchRoot} className="launcher-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
        <input ref={searchField} id={`${id}-launcher`} className="input" role="combobox" aria-autocomplete="list" aria-expanded={open && !editor} aria-controls={`${id}-choices`} aria-activedescendant={open && options[highlight] ? `${id}-choice-${highlight}` : undefined}
          value={query ?? (selected ? label(selected) : t("Default"))} disabled={disabled || busy || editor !== null} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onFocus={(event) => { setOpen(true); event.target.select(); }} onClick={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setSuggestions([]); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) { event.stopPropagation(); return; }
            if (event.key === "Escape" && (open || query !== null)) { event.preventDefault(); event.stopPropagation(); cancelSearch(); }
            else if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); if (open) choose(highlight); else setOpen(true); }
            else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(); setOpen(true);
              setHighlightedKey(options[Math.max(0, Math.min(options.length - 1, highlight + (event.key === "ArrowDown" ? 1 : -1)))]?.key ?? null);
            } else if (event.key === "Tab") setOpen(false);
          }} />
        {open && !editor && <div className="launcher-popup" style={place}>
        <div id={`${id}-choices`} className="launcher-choices" role="listbox" aria-label={t("Launcher")}>
          {optionGroups.filter((group) => group.options.length).map((group) => <div key={group.key} role={group.label ? "group" : "presentation"} aria-label={group.label ?? undefined}>
            {group.label && <div className="field-label launcher-choice-heading" aria-hidden="true">{group.label}</div>}
            {group.options.map((option) => {
              const index = options.indexOf(option);
              return <button type="button" tabIndex={-1} key={option.key} id={`${id}-choice-${index}`} role="option" aria-selected={option.selected} aria-disabled={option.disabled} className={index === highlight ? "launcher-choice active" : "launcher-choice"}
                onPointerDown={(event) => event.preventDefault()} onPointerMove={() => setHighlightedKey(option.key)} onClick={() => choose(index)}>{option.text}</button>;
            })}
          </div>)}
        </div>
        {searchMessage && <span className="field-hint launcher-search-status" aria-hidden="true">{searchMessage}</span>}
        </div>}
        {query !== null && <button type="button" className="btn btn-ghost" onClick={cancelSearch}>{t("Cancel search")}</button>}
      </div> : <select id={`${id}-launcher`} className="input" value={launcher} disabled={disabled || busy || editor !== null} onChange={(event) => { setConfirmDelete(false); setError(null); onLauncherChange(event.target.value); }}>
        <option value="" disabled={agent?.installed === false}>{t("Default")}</option>
        {agent?.launchers?.filter((choice) => !choice.saved).map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
        {agent?.launchers?.some((choice) => choice.saved) && <optgroup label={t("Saved launchers")}>
          {agent.launchers.filter((choice) => choice.saved).map((choice) => <option key={choice.id} value={choice.id}>{label(choice)}</option>)}
        </optgroup>}
      </select>}
      {agent?.installed === false && !launcher && <span className="field-hint">{t("Choose a launcher to start {agent} on this PC.", { agent: agent.label })}</span>}
      {agent?.saved_launchers && <>
        {!editor && <div className="launcher-actions">
          <button ref={addButton} type="button" className="btn btn-ghost" disabled={disabled || busy} onClick={() => { setConfirmDelete(false); setError(null); cancelSearch(); setEditor({ label: "", executable: "", args: [] }); }}>{t("Add launcher")}</button>
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
