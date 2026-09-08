# 0007 — Sistema visual

Define a fundação visual do app: de onde vêm cor, tipografia, espaçamento e estados de interação.
Não descreve tela nenhuma — isso é a [0008](./0008-telas.md).

A v1 beta funciona ponta a ponta com estilo inline espalhado por seis componentes. Esta spec
troca isso por uma fonte única de verdade, para que a 0008 seja montagem e não redecoração.

## O sistema

**Nocturne**, gerado no Claude Design e vendorizado no repositório em
`apps/desktop/src/renderer/src/styles/nocturne/`. É um sistema escuro, compacto e de baixa
saturação: fundo `#161826`, um acento único `#9184d9` usado como linha e brilho — nunca como
preenchimento de área grande — e contraste vindo das rampas tonais, não da saturação.

Ele chega em duas camadas, e as duas entram:

- **Tokens**: `--color-*` (rampas 100–900 para neutro e acento), `--font-*`, `--space-*`
  (escala com densidade 0,70×), `--radius-*`, `--shadow-*`.
- **Componentes**: `.btn` com `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-icon` /
  `.btn-block`, `.input`, `.field`, `.card`, `.table`, `.dialog` com `.dialog-backdrop`, `.tag`.

A camada de componentes é importada **como veio**. Ela já resolve hover, pressionado,
`:focus-visible` com anel de 2px e `disabled` a 45% de opacidade — que é exatamente o conjunto de
estados que se perde quando alguém reescreve um botão em utilitários e testa só o estado normal.

## Tailwind

Tailwind v4, via `@tailwindcss/vite` no `electron.vite.config.ts`, com os tokens do Nocturne
expostos por `@theme`:

```css
@import "tailwindcss";
@import "./nocturne/styles.css";

@theme {
  --color-bg: var(--color-bg);
  --color-accent-500: var(--color-accent-500);
  /* … um alias por token do Nocturne */
}
```

O `@theme` é uma folha de apelidos, sem config em JavaScript. É ele que faz trocar de sistema de
design depois ser reescrever um arquivo em vez de caçar cores em trinta componentes.

**Divisão de trabalho**: Tailwind faz layout — flex, grid, espaçamento, tamanho, posição. Cor,
tipografia, raio, sombra e estado vêm das classes e dos tokens do Nocturne. Utilitário de cor
literal (`bg-[#1e1f22]`, `text-gray-400`) é bug, não atalho.

## Tipografia

Inter nos pesos 400, 500 e 600, **vendorizado como `.woff2`** em
`apps/desktop/src/renderer/src/styles/fonts/` e declarado com `@font-face`.

Não é preferência: o `index.html` roda com `default-src 'self'`, e o `<link>` do Google Fonts que
o mock usa é bloqueado por essa CSP. As duas alternativas eram afrouxar a CSP para dois domínios
externos — fazendo um app desktop depender da rede para renderizar texto — ou cair para
`system-ui`, que descaracteriza um sistema construído sobre o Inter em peso 500. Vendorizar custa
cerca de 100 KB e nenhuma das duas coisas.

Títulos não passam de peso 500. A hierarquia aqui é tamanho e espaço.

## Ícones

Phosphor, como SVG inline em `currentColor`. Sem pacote de ícones e sem CDN — os traçados
necessários ficam em `components/icons/`, adicionados um a um conforme aparecem.

## Regras

- **Zero estilo inline em TSX.** É o que esta spec vem apagar; reintroduzir um `style={{ … }}`
  desfaz a fundação em silêncio.
- **Nada de hex, px ou nome de fonte literal** onde existe token.
- **Só tema escuro.** O Nocturne é escuro por construção e o app não tem alternância; não há
  `prefers-color-scheme`.
- **Estados nunca são o padrão do navegador.** Foco de teclado é o anel de acento de 2px do
  Nocturne, em todo elemento interativo — inclusive nas miniaturas e nas células da Grade, que
  são `<button>`.
- **A CSP não se afrouxa.** Se algo do design exigir origem externa, o algo muda.

## Pronto quando

- `grep -rn "style={{" apps/desktop/src/renderer` não retorna nada.
- `grep -rnE "#[0-9a-fA-F]{6}" apps/desktop/src/renderer/src --exclude-dir=styles` não retorna
  nada.
- O app abre sem violação de CSP no console, com o Inter renderizando offline (teste: modo avião).
- Navegar o app inteiro só pelo teclado mostra o anel de foco do Nocturne em todo controle.
