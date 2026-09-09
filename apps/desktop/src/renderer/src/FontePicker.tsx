import { useEffect, useMemo, useState } from "react";
import type { FontePickerItem } from "../../shared/ipc.js";
import { IconAppWindow, IconMonitor } from "./components/icons/index.js";

type Aba = "monitores" | "janelas";

function SourceGrid({ items, onChoose }: { readonly items: readonly FontePickerItem[]; readonly onChoose: (id: string) => void }) {
  if (items.length === 0) {
    return <p className="field-hint">Nada aqui agora.</p>;
  }
  return (
    <div className="source-grid">
      {items.map((source) => (
        <button
          key={source.id}
          type="button"
          className="source-card card flex min-w-0 cursor-pointer flex-col gap-2 p-2 text-left"
          onClick={() => onChoose(source.id)}
        >
          <img src={source.thumbnailDataUrl} alt="" className="source-thumb" />
          <span className="truncate text-sm">{source.name}</span>
          <span className="source-overlay" aria-hidden="true">
            Transmitir
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Modal dentro da própria janela (spec 0008, "Seletor de Fonte") — não há mais `BrowserWindow`
 * separada nem rota `#/picker`. Quem abre e fecha é o processo principal, que continua dono da
 * enumeração: `desktopCapturer.getSources()` roda lá e a lista chega por IPC, atualizada a cada
 * segundo enquanto o seletor está aberto (spec 0003, "Captura").
 */
export function FontePicker() {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<readonly FontePickerItem[]>([]);
  const [aba, setAba] = useState<Aba>("monitores");

  useEffect(
    () =>
      window.picker.onOpenChange((isOpen) => {
        setOpen(isOpen);
        if (isOpen) setAba("monitores");
        else setSources([]);
      }),
    [],
  );
  useEffect(() => window.picker.onSources(setSources), []);

  const monitores = useMemo(() => sources.filter((s) => s.kind === "screen"), [sources]);
  const janelas = useMemo(() => sources.filter((s) => s.kind === "window"), [sources]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") window.picker.cancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-label="Escolher Fonte">
        <div className="flex flex-none flex-col gap-1">
          <h2 className="dialog-title">Escolher Fonte</h2>
          <p className="dialog-subtitle">O áudio do sistema não é compartilhado.</p>
        </div>

        {/* Monitores e Janelas — o vocabulário do CONTEXT.md, não "Aplicativos / Tela inteira". */}
        <div className="tabs flex-none" role="tablist" aria-label="Tipo de Fonte">
          <button type="button" className="tab" role="tab" aria-selected={aba === "monitores"} onClick={() => setAba("monitores")}>
            <IconMonitor /> Monitores
          </button>
          <button type="button" className="tab" role="tab" aria-selected={aba === "janelas"} onClick={() => setAba("janelas")}>
            <IconAppWindow /> Janelas
          </button>
        </div>

        <div className="dialog-body">
          <SourceGrid items={aba === "monitores" ? monitores : janelas} onChoose={(id) => window.picker.choose(id)} />
        </div>

        <div className="dialog-footer flex-none">
          <button type="button" className="btn btn-ghost" onClick={() => window.picker.cancel()}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
