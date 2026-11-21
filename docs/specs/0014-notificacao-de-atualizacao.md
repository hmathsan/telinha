# 0014 — Notificação de atualização no app

Quando sai uma versão nova do Telinha no GitHub Releases, o app baixa em segundo plano e **avisa
na interface** quando ela está pronta para instalar, com um botão para reiniciar e aplicar na hora.
A [spec 0005](./0005-empacotamento.md) já faz o download silencioso em segundo plano e instala ao
fechar (`autoInstallOnAppQuit`), mas sem mostrar nada na tela e sem escrever nada no log — quem
deixa o app aberto ou recebe "Atualize o aplicativo para entrar nesta Sessão" não sabe se a versão
nova já baixou ou se precisa esperar.

**Esta spec revisa a seção "Atualização" da [0005](./0005-empacotamento.md):** o download continua
automático e diferencial (com blockmap), e o `autoInstallOnAppQuit` continua ligado como rede de
segurança, mas o estado deixa de ser invisível.

Não toca no protocolo nem no sinalizador.

## Comportamento

- **Checagem no boot e periódica.** O `autoUpdater` checa na abertura do app empacotado e volta a
  checar a cada `UPDATE_CHECK_INTERVAL_MS` (4 h), caso o app fique aberto a noite inteira.
- **Download automático.** Assim que uma versão nova é detectada (`update-available`), o
  `electron-updater` baixa automaticamente (`autoDownload = true`, padrão) com delta via blockmap.
- **Faixa discreta na interface** (sem modal e sem interromper a Sessão):
  - **Baixando (`downloading`):** `"Baixando Telinha X.Y.Z… 42%"` (sem porcentagem se ainda não
    chegou progresso), com botão **Dispensar**.
  - **Pronta (`ready`):** `"Telinha X.Y.Z pronta para instalar."`, com botão **Reiniciar e
    instalar** e botão **Dispensar**.
  - **Onde aparece:** na Entrada (`EntryScreen`, acima dos avisos de entrada) e dentro da Sessão
    (`SessaoScreen`, como faixa no topo da coluna principal, acima do Palco — a mesma região da
    faixa de aviso do Som).
- **Dispensar:**
  - Dispensar enquanto está baixando esconde o progresso, mas **não** esconde o aviso quando o
    download terminar (`ready`) — a pessoa ainda precisa saber que já pode reiniciar.
  - Dispensar em `ready` esconde aquela versão nesta execução; se depois sair uma versão ainda mais
    nova, a faixa volta.
  - Mesmo dispensando, `autoInstallOnAppQuit` continua aplicando a atualização quando o app fechar.
- **Reiniciar e instalar:**
  - Encerra a conexão de sinalização de forma limpa (`signalingClient?.leave()`, para que um
    Anfitrião encerre a Sessão de imediato em vez de deixar os amigos esperando o timeout da
    Retomada) e chama `autoUpdater.quitAndInstall(false, true)` (mantém o instalador NSIS
    interativo, coerente com `oneClick: false` em `electron-builder.yml`, e reabre o app ao
    terminar).
  - Não reinicia sozinho sem clique enquanto o app estiver aberto.
- **Falhas nunca viram erro na tela.** Rede fora do ar, GitHub indisponível ou limite de taxa são
  registrados no `main.log` (`update-error`, warn) e devolvem o estado para `idle`.
- **Válvula de desenvolvimento (`SCRN_BROADCAST_FAKE_UPDATE`):** fora do app empacotado
  (`!app.isPackaged`), definir `SCRN_BROADCAST_FAKE_UPDATE=1.1.0` simula `downloading` (progresso
  de 0% a 100% em passos curtos) seguido de `ready`, para testar a UI sem precisar empacotar e
  publicar no GitHub. No app empacotado a válvula é sempre ignorada.

## Estado puro (`shared/updateState.ts`)

Toda a lógica de transição e visibilidade vive fora do React:

```ts
export type UpdateStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "downloading"; readonly version: string; readonly percent: number | null }
  | { readonly kind: "ready"; readonly version: string };

export interface UpdateDismissal {
  readonly kind: "downloading" | "ready";
  readonly version: string;
}

export function shouldShowUpdateBanner(
  status: UpdateStatus,
  dismissed: UpdateDismissal | null,
): boolean;

/** Normaliza o percentual do `electron-updater` (0–100 inteiro, ou `null` se inválido). */
export function normalizeDownloadPercent(percent: unknown): number | null;
```

Em `shared/hardening.ts`, acrescente:

```ts
export const FAKE_UPDATE_ENV_VAR = "SCRN_BROADCAST_FAKE_UPDATE";

/** Devolve a versão simulada só fora do app empacotado; em release é sempre `null`. */
export function fakeUpdateVersion(isPackaged: boolean, env: Record<string, string | undefined>): string | null;
```

Os testes (`updateState.test.ts` e `hardening.test.ts`) cobrem:

- `idle` nunca mostra faixa;
- `downloading` mostra faixa; dispensar em `downloading` esconde `downloading` daquela versão;
- a transição de `downloading` para `ready` da mesma versão volta a mostrar a faixa;
- dispensar `ready` esconde aquela versão, mas uma versão posterior volta a mostrar;
- `normalizeDownloadPercent` arredonda, limita a `0..100` e devolve `null` para `NaN`/não-número;
- `fakeUpdateVersion` devolve `null` quando `isPackaged === true`, mesmo com a variável definida.

## IPC (`shared/ipc.ts`, `preload/index.ts`)

Canais novos:

- `updateGetStatus` (`update:get-status`): `getUpdateStatus(): Promise<UpdateStatus>` — garante que
  o renderer conheça o estado atual mesmo se o evento já aconteceu antes da montagem do React.
- `updateStatus` (`update:status`): `onUpdateStatus(cb: (status: UpdateStatus) => void): () => void`.
- `updateInstall` (`update:install`): `installUpdate(): void` — dispara o `leave()` limpo e
  `quitAndInstall(false, true)` (no modo simulado, só loga `update-install-simulated` e volta a
  `idle`).

## Interface

Componente reutilizável `UpdateBanner.tsx` no Nocturne (`styles/nocturne/components.css`, sem
estilo inline e sem hex, com anel de foco):

- usa o estilo de faixa discreta (`card card-accent` em `ready`, `card card-quiet` em
  `downloading`), com ícone `IconDownload` (já existe em `components/icons/index.tsx`), texto da
  versão, botão primário pequeno **Reiniciar e instalar** quando `ready` e botão `IconX` para
  dispensar;
- `role="status"` para leitores de tela.

## Log

| Evento | Onde | Nível | Campos |
| --- | --- | --- | --- |
| `update-check-started` | principal | info | — |
| `update-available` | principal | info | `version` |
| `update-not-available` | principal | info | `version` |
| `update-downloaded` | principal | info | `version` |
| `update-install-requested` | principal | info | `version` |
| `update-error` | principal | warn | `message` |

`download-progress` **não** escreve no log a cada tique para não poluir o `main.log`.

## Roteiro manual

1. **Simulação em dev.** Rode com `SCRN_BROADCAST_FAKE_UPDATE=1.1.0`. Verifique o progresso na
   Entrada, dispense durante o download e confirme que a faixa reaparece ao chegar em `ready`.
   Verifique a faixa também dentro de uma Sessão.
2. **Release real.** Instale uma versão anterior (ex.: `1.0.0`), publique uma versão nova como
   release no GitHub e abra o app. A faixa mostra o download, muda para "pronta para instalar" e
   clicar em **Reiniciar e instalar** fecha a Sessão de forma limpa, abre o instalador NSIS e
   reabre na versão nova.
3. **Offline.** Abra o app instalado sem internet: nenhuma mensagem de erro na tela, e `main.log`
   registra `update-error`.

## Pronto quando

- `npm test` passa com `updateState.test.ts` e o caso novo de `hardening.test.ts`.
- `npm run typecheck` passa.
- Os eventos do `autoUpdater` aparecem no `main.log`.
- Os casos 1 a 3 do roteiro passam.
