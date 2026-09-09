import { EntryScreen } from "./EntryScreen.js";
import { FontePicker } from "./FontePicker.js";
import { SessaoScreen } from "./SessaoScreen.js";
import { useSessao } from "./useSessao.js";

export function App() {
  const sessao = useSessao();

  return (
    <>
      {sessao.state.screen === "entry" ? (
        <EntryScreen
          entryError={sessao.state.entryError}
          sessaoEndedReason={sessao.state.sessaoEndedReason}
          lastDisconnectReason={sessao.state.lastDisconnectReason}
          awaitingApproval={sessao.state.awaitingApproval}
          onConnect={sessao.connect}
          onCancel={sessao.leave}
        />
      ) : (
        <SessaoScreen
          state={sessao.state}
          connectionState={sessao.connectionState}
          remoteStreams={sessao.remoteStreams}
          diagnostics={sessao.diagnostics}
          warnings={sessao.warnings}
          isTransmitting={sessao.isTransmitting}
          localStream={sessao.localStream}
          mediaEpoch={sessao.mediaEpoch}
          onRespondEntry={sessao.respondEntry}
          onStartTransmitindo={sessao.startTransmitindo}
          onReleasePalco={sessao.releasePalco}
          onExpel={sessao.expel}
          onLeave={sessao.leave}
          onDismissWarning={sessao.dismissWarning}
          onExportDiagnostics={sessao.exportDiagnostics}
        />
      )}

      {/* O seletor de Fonte é um modal desta janela; quem o abre e fecha é o processo principal. */}
      <FontePicker />
    </>
  );
}
