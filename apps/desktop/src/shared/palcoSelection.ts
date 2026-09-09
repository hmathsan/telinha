/**
 * As regras de layout do Palco, fora do React (spec 0008, "Regras de layout ficam fora do React").
 *
 * Visibilidade do alternador, ordem das células, quem está no Palco e o que acontece com a Grade
 * quando um Transmissor sai e sobra um: tudo aqui, testável sem montar componente. "Um Transmissor
 * sai enquanto você está na Grade" é o caso que ninguém reproduz à mão e que quebra em produção;
 * como função pura custa três linhas de teste.
 */

/** Os dois modos do Palco (CONTEXT.md). Foco é o padrão; Grade é a alternativa. */
export type ModoPalco = "foco" | "grade";

/**
 * Quem ocupa o Palco nesta janela: o primeiro Transmissor por padrão, ou quem foi promovido por
 * clique numa miniatura — enquanto essa pessoa ainda estiver transmitindo (spec 0004, "Palco").
 * Puramente local: não é o roster autoritativo (isso vive no sinalizador), só a escolha de exibição
 * de quem está vendo.
 */
export function selectPalco(transmissorIds: readonly string[], promotedId: string | null): string | null {
  if (promotedId !== null && transmissorIds.includes(promotedId)) return promotedId;
  return transmissorIds[0] ?? null;
}

export interface PalcoLayoutInput {
  /** Ordem autoritativa do roster (`state.transmissores`), não a ordem de chegada das streams. */
  readonly transmissorIds: readonly string[];
  /** Quais desses Transmissores já têm mídia para exibir. */
  readonly streamIds: ReadonlySet<string>;
  readonly promotedId: string | null;
  /** O que a pessoa escolheu no alternador — não necessariamente o modo efetivo. */
  readonly modoPreferido: ModoPalco;
}

export interface PalcoLayout {
  /** O modo efetivo. Pode diferir do preferido quando não há Grade a fazer. */
  readonly modo: ModoPalco;
  readonly alternadorVisivel: boolean;
  readonly stagedId: string | null;
  /** Miniaturas da faixa, em modo Foco. Vazio em Grade. */
  readonly thumbnailIds: readonly string[];
  /** Células da Grade, na ordem do roster. Vazio em Foco. */
  readonly cellIds: readonly string[];
  readonly vazio: boolean;
}

export function selectPalcoLayout(input: PalcoLayoutInput): PalcoLayout {
  const ordered = input.transmissorIds.filter((id) => input.streamIds.has(id));

  // Com um só Transmissor não há escolha de layout a fazer, e um controle que não muda nada
  // visível parece defeito (spec 0008, "Palco"). O modo preferido fica guardado em quem chama:
  // se um segundo Transmissor voltar, a Grade volta com ele.
  const alternadorVisivel = ordered.length >= 2;
  const modo: ModoPalco = alternadorVisivel ? input.modoPreferido : "foco";
  const stagedId = selectPalco(ordered, input.promotedId);

  return {
    modo,
    alternadorVisivel,
    stagedId,
    thumbnailIds: modo === "foco" ? ordered.filter((id) => id !== stagedId) : [],
    cellIds: modo === "grade" ? ordered : [],
    vazio: ordered.length === 0,
  };
}

export interface PalcoClickInput {
  readonly modo: ModoPalco;
  readonly alternadorVisivel: boolean;
  /** Quem foi clicado: a Fonte no Palco, uma miniatura da faixa, ou uma célula da Grade. */
  readonly clickedId: string;
  readonly stagedId: string | null;
}

export interface PalcoClickResult {
  readonly modoPreferido: ModoPalco;
  readonly promotedId: string;
}

/**
 * O que um clique numa Fonte do Palco faz. São três casos, e a diferença entre eles é só quem foi
 * clicado — por isso a regra mora aqui e não espalhada por três `onClick` de componente:
 *
 * - **Grade**, clique numa célula: aquele Transmissor vai para o Palco, em Foco.
 * - **Foco**, clique numa miniatura: aquele Transmissor troca com quem está no Palco, sem sair do Foco.
 * - **Foco**, clique em quem já está no Palco: vai para a Grade — quando há Grade a que ir. Com um
 *   Transmissor só, o clique não faz nada, pela mesma razão que o alternador não aparece.
 */
export function selectPalcoClick(input: PalcoClickInput): PalcoClickResult {
  if (input.modo === "grade") {
    return { modoPreferido: "foco", promotedId: input.clickedId };
  }
  if (input.clickedId !== input.stagedId) {
    return { modoPreferido: "foco", promotedId: input.clickedId };
  }
  return { modoPreferido: input.alternadorVisivel ? "grade" : "foco", promotedId: input.clickedId };
}
