import { useEffect, useState } from "react";
import type { FontePickerItem } from "../../shared/ipc.js";

/** A grade estilo Discord que substitui o seletor da Microsoft (spec 0003, "Captura"). */
export function PickerScreen() {
  const [sources, setSources] = useState<readonly FontePickerItem[]>([]);

  useEffect(() => window.picker.onSources(setSources), []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 16, background: "#1e1f22", color: "#eee", height: "100vh", boxSizing: "border-box" }}>
      <h2 style={{ marginTop: 0 }}>Escolher Fonte</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, overflowY: "auto" }}>
        {sources.map((source) => (
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
            }}
          >
            <img
              src={source.thumbnailDataUrl}
              alt={source.name}
              style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 4, background: "#111" }}
            />
            <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {source.kind === "screen" ? "🖥️ " : "🪟 "}
              {source.name}
            </span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16, textAlign: "right" }}>
        <button onClick={() => window.picker.cancel()}>Cancelar</button>
      </div>
    </div>
  );
}
