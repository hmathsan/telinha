import { useEffect, useMemo, useState } from "react";
import type { FontePickerItem } from "../../shared/ipc.js";
import { IconAppWindow, IconMonitor } from "./components/icons/index.js";

function SourceGrid({ items }: { readonly items: readonly FontePickerItem[] }) {
  return (
    <div className="source-grid">
      {items.map((source) => (
        <button
          key={source.id}
          type="button"
          className="card flex min-w-0 cursor-pointer flex-col gap-2 p-2 text-left"
          onClick={() => window.picker.choose(source.id)}
        >
          <img src={source.thumbnailDataUrl} alt={source.name} className="aspect-video w-full rounded-sm bg-well object-cover" />
          <span className="overflow-hidden text-sm text-ellipsis whitespace-nowrap">{source.name}</span>
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
    <div className="flex h-screen flex-col gap-3 p-4">
      <h2 className="flex-none">Escolher Fonte</h2>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        {screens.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="section-label">
              <IconMonitor /> Monitores
            </h3>
            <SourceGrid items={screens} />
          </section>
        )}
        {windows.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="section-label">
              <IconAppWindow /> Janelas
            </h3>
            <SourceGrid items={windows} />
          </section>
        )}
      </div>

      <div className="flex flex-none justify-end">
        <button type="button" className="btn btn-ghost" onClick={() => window.picker.cancel()}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
