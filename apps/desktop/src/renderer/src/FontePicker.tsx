import { useEffect, useMemo, useState } from "react";
import type { FontePickerItem, SomSupport } from "../../shared/ipc.js";
import { IconAppWindow, IconMonitor, IconWarningCircle } from "./components/icons/index.js";

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
  /** "Transmitir com Som": ligado a cada abertura, porque é uma escolha por transmissão (spec 0010). */
  const [somLigado, setSomLigado] = useState(true);
  const [somSupport, setSomSupport] = useState<SomSupport | null>(null);

  useEffect(
    () =>
      window.picker.onOpenChange((isOpen) => {
        setOpen(isOpen);
        if (isOpen) {
          setAba("monitores");
          setSomLigado(true);
          void window.scrnBroadcast.getSomSupport().then(setSomSupport);
        } else setSources([]);
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

  // Enquanto a resposta não chega, o alternador não promete o que pode não haver.
  const somPossivel = somSupport !== null && (aba === "monitores" ? somSupport.screen : somSupport.window);

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-label="Escolher Fonte">
        <div className="flex flex-none flex-col gap-1">
          <h2 className="dialog-title">Escolher Fonte</h2>
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

        <div className="flex flex-none flex-col gap-3">
          {/* A linha de apoio só existe no Windows 10, onde o alternador fica desabilitado. */}
          <div className="flex items-start gap-3">
            <button
              type="button"
              role="switch"
              className="switch"
              id="transmitir-com-som"
              aria-checked={somLigado && somPossivel}
              aria-describedby={somSupport !== null && !somPossivel ? "som-exige-windows-11" : undefined}
              disabled={!somPossivel}
              onClick={() => setSomLigado((v) => !v)}
            />
            <span className="flex flex-col gap-1">
              <label htmlFor="transmitir-com-som" className="text-md">
                Transmitir com Som
              </label>
              {somSupport !== null && !somPossivel && (
                <span id="som-exige-windows-11" className="field-hint">
                  Som exige Windows 11
                </span>
              )}
            </span>
          </div>
          {aba === "monitores" && somLigado && somPossivel && (
            <p className="faixa-warn py-2" role="note">
              <IconWarningCircle className="faixa-warn-icon" />
              <span>
                O Som do sistema leva tudo o que toca neste computador. Se você está no Discord ou em outro app de voz,
                quem fala pode se ouvir de volta — nesse caso, transmita a janela do jogo.
              </span>
            </p>
          )}
        </div>

        <div className="dialog-body">
          {/* O valor do alternador vai como está, mesmo desabilitado: no Windows 10 o motivo no log
              continua sendo `windows-10`, não `som-off`. */}
          <SourceGrid
            items={aba === "monitores" ? monitores : janelas}
            onChoose={(id) => window.picker.choose(id, { som: somLigado })}
          />
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
