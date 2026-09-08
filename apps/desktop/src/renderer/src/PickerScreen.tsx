import { useEffect, useMemo, useState } from "react";
import type { FontePickerItem } from "../../shared/ipc.js";

function SourceGrid({ items }: { readonly items: readonly FontePickerItem[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
      {items.map((source) => (
        <button
          key={source.id}
          onClick={() => window.picker.choose(source.id)}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 8,
            background: "#2b2d31",
            border: "1px solid #3a3c42",
            borderRadius: 8,
            color: "inherit",
            cursor: "pointer",
            textAlign: "left",
            minWidth: 0,
          }}
        >
          <img
            src={source.thumbnailDataUrl}
            alt={source.name}
            style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 4, background: "#111" }}
          />
          <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{source.name}</span>
        </button>
      ))}
    </div>
  );
}

/** A grade estilo Discord que substitui o seletor da Microsoft (spec 0003, "Captura"). */
export function PickerScreen() {
  const [sources, setSources] = useState<readonly FontePickerItem[]>([]);

  useEffect(() => window.picker.onSources(setSources), []);

  const screens = useMemo(() => sources.filter((s) => s.kind === "screen"), [sources]);
  const windows = useMemo(() => sources.filter((s) => s.kind === "window"), [sources]);

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        background: "#1e1f22",
        color: "#eee",
        height: "100vh",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        padding: 16,
        gap: 12,
      }}
    >
      <h2 style={{ margin: 0, flex: "0 0 auto" }}>Escolher Fonte</h2>

      <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
        {screens.length > 0 && (
          <section>
            <h3 style={{ margin: "0 0 8px", fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>MONITORES</h3>
            <SourceGrid items={screens} />
          </section>
        )}
        {windows.length > 0 && (
          <section>
            <h3 style={{ margin: "0 0 8px", fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>JANELAS</h3>
            <SourceGrid items={windows} />
          </section>
        )}
      </div>

      <div style={{ flex: "0 0 auto", textAlign: "right" }}>
        <button onClick={() => window.picker.cancel()}>Cancelar</button>
      </div>
    </div>
  );
}
