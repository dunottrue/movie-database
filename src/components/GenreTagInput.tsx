import { useState } from "react";

interface Props {
  value: string[];
  onChange: (genres: string[]) => void;
  placeholder?: string;
}

export default function GenreTagInput({ value, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const clean = raw.trim();
    if (!clean) return;
    const low = clean.toLowerCase();
    if (value.some((g) => g.toLowerCase() === low)) return;
    onChange([...value, clean]);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === " " || e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
      setDraft("");
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="tag-input">
      {value.map((g, i) => (
        <span key={`${g}-${i}`} className="tag-chip">
          {g}
          <button
            type="button"
            className="tag-chip-x"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label={`Убрать ${g}`}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        className="tag-input-field"
        value={draft}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => {
          commit(draft);
          setDraft("");
        }}
      />
    </div>
  );
}