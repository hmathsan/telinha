import type { IceServer } from "@scrn-broadcast/protocol";

// ADR 0007: a Cloudflare não tem teto de gasto próprio para o TURN relay. Este módulo é o
// desligador — consulta o egresso acumulado do mês e nega credenciais TURN acima do limite
// configurado, devolvendo só STUN.

export interface TurnEnv {
  readonly TURN_SPEND_LIMIT_GB: number;
  readonly TURN_KEY_ID?: string;
  readonly TURN_TOKEN?: string;
  readonly CF_ACCOUNT_ID?: string;
  readonly CF_ANALYTICS_TOKEN?: string;
}

const STUN_SERVERS: readonly IceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const TURN_CREDENTIAL_TTL_SECONDS = 10 * 60;
const BYTES_PER_GB = 1_000_000_000;

function startOfMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Egresso TURN acumulado do mês corrente, em GB, via o dataset callsTurnUsageAdaptiveGroups. */
export async function monthlyTurnEgressGB(
  env: TurnEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN) {
    throw new Error("missing CF_ACCOUNT_ID/CF_ANALYTICS_TOKEN for TURN usage query");
  }
  const query = `query {
    viewer {
      accounts(filter: { accountTag: "${env.CF_ACCOUNT_ID}" }) {
        callsTurnUsageAdaptiveGroups(filter: { date_geq: "${startOfMonthIso()}" }, limit: 1) {
          sum { egressBytes }
        }
      }
    }
  }`;

  const response = await fetchImpl(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    throw new Error(`turn usage query failed with status ${response.status}`);
  }
  const body = (await response.json()) as {
    data?: {
      viewer?: {
        accounts?: readonly { callsTurnUsageAdaptiveGroups?: readonly { sum?: { egressBytes?: number } }[] }[];
      };
    };
  };
  const egressBytes =
    body.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups?.[0]?.sum?.egressBytes ?? 0;
  return egressBytes / BYTES_PER_GB;
}

/**
 * `TURN_SPEND_LIMIT_GB <= 0` desliga a emissão sem sequer consultar o egresso — é o "limite de
 * gasto zerado" do critério de pronto. Falha ao consultar a Cloudflare também nega, por segurança:
 * é preferível recusar TURN do que arriscar uma fatura surpresa.
 */
export async function shouldEmitTurnCredentials(
  env: TurnEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (env.TURN_SPEND_LIMIT_GB <= 0) {
    return false;
  }
  try {
    const usedGB = await monthlyTurnEgressGB(env, fetchImpl);
    return usedGB < env.TURN_SPEND_LIMIT_GB;
  } catch {
    return false;
  }
}

async function mintTurnCredentials(
  env: TurnEnv,
  customIdentifier: string,
  fetchImpl: typeof fetch,
): Promise<IceServer[] | null> {
  if (!env.TURN_KEY_ID || !env.TURN_TOKEN) {
    return null;
  }
  const response = await fetchImpl(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.TURN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS, customIdentifier }),
    },
  );
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { iceServers?: IceServer | IceServer[] };
  if (!body.iceServers) {
    return null;
  }
  return Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
}

/** STUN sempre; TURN só quando o desligador de gasto permite. `customIdentifier` é o participanteId. */
export async function buildIceServers(
  env: TurnEnv,
  customIdentifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<IceServer[]> {
  if (!(await shouldEmitTurnCredentials(env, fetchImpl))) {
    return [...STUN_SERVERS];
  }
  const turnServers = await mintTurnCredentials(env, customIdentifier, fetchImpl);
  return turnServers ? [...STUN_SERVERS, ...turnServers] : [...STUN_SERVERS];
}
