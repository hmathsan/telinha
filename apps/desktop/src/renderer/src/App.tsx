import { useEffect, useState } from "react";
import type { UpdateDismissal, UpdateStatus } from "../../shared/updateState.js";
import { EntryScreen } from "./EntryScreen.js";
import { FontePicker } from "./FontePicker.js";
import { SessaoScreen } from "./SessaoScreen.js";
import { UpdateBanner } from "./UpdateBanner.js";
import { useSessao } from "./useSessao.js";

export function App() {
  const sessao = useSessao();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: "idle" });
  const [updateDismissed, setUpdateDismissed] = useState<UpdateDismissal | null>(null);

  useEffect(() => {
    let active = true;
    const offStatus = window.scrnBroadcast.onUpdateStatus((status) => {
      if (active) setUpdateStatus(status);
    });
    void window.scrnBroadcast.getUpdateStatus().then((status) => {
      if (active) setUpdateStatus(status);
    });
    return () => {
      active = false;
      offStatus();
    };
  }, []);

  const updateBanner = (
    <UpdateBanner
      status={updateStatus}
      dismissed={updateDismissed}
      onInstall={() => window.scrnBroadcast.installUpdate()}
      onDismiss={setUpdateDismissed}
    />
  );

  return (
    <>
      {sessao.state.screen === "entry" ? (
        <EntryScreen
          entryError={sessao.state.entryError}
          sessaoEndedReason={sessao.state.sessaoEndedReason}
          lastDisconnectReason={sessao.state.lastDisconnectReason}
          awaitingApproval={sessao.state.awaitingApproval}
          updateBanner={updateBanner}
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
          somStatus={sessao.somStatus}
          somAtivo={sessao.somAtivo}
          somStates={sessao.somStates}
          apitoSilenciado={sessao.apitoSilenciado}
          updateBanner={updateBanner}
          onSetSomAtivo={sessao.setSomAtivo}
          onSetApitoSilenciado={sessao.setApitoSilenciado}
          onSetRemoteVideoPaused={sessao.setRemoteVideoPaused}
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
