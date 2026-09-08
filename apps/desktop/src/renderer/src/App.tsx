import { EntryScreen } from "./EntryScreen.js";
import { SessaoScreen } from "./SessaoScreen.js";
import { useSessao } from "./useSessao.js";

export function App() {
  const sessao = useSessao();

  if (sessao.state.screen === "entry") {
    return (
      <EntryScreen
        entryError={sessao.state.entryError}
        sessaoEndedReason={sessao.state.sessaoEndedReason}
        onConnect={sessao.connect}
      />
    );
  }

  return (
    <SessaoScreen
      state={sessao.state}
      connectionState={sessao.connectionState}
      remoteStreams={sessao.remoteStreams}
      diagnostics={sessao.diagnostics}
      warnings={sessao.warnings}
      isTransmitting={sessao.isTransmitting}
      onRespondEntry={sessao.respondEntry}
      onStartTransmitindo={sessao.startTransmitindo}
      onReleasePalco={sessao.releasePalco}
      onExpel={sessao.expel}
      onLeave={sessao.leave}
      onDismissWarning={sessao.dismissWarning}
      onExportDiagnostics={sessao.exportDiagnostics}
    />
  );
}
