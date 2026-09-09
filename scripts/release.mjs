#!/usr/bin/env node
/**
 * Publica uma release do app desktop, da máquina de quem mantém o projeto.
 *
 * Não há CD para o desktop de propósito: o instalador sai daqui, e não de um runner. O que sai do
 * CI é o sinalizador (`.github/workflows/deploy-signaler.yml`), disparado pela tag que este script
 * empurra.
 *
 * **A tag é a fonte da verdade da versão** (spec 0005, "Versão"). `apps/desktop/package.json` fica
 * em 0.0.0 para sempre: a versão entra no pacote por `--config.extraMetadata.version`, que
 * reescreve o `package.json` empacotado — que é o que o `electron-updater` lê. Assim uma release
 * não precisa de commit de bump, e a `main` protegida continua protegida.
 *
 *   node scripts/release.mjs 1.0.0
 *
 * Precisa de duas variáveis no ambiente:
 *   MAIN_VITE_SIGNALER_URL  wss:// do sinalizador; é injetada em build time e fica congelada
 *                           dentro do instalador. Sobrepõe o `.env` (verificado: o `loadEnv` do
 *                           Vite prioriza o que vem do processo).
 *   GH_TOKEN                PAT com escopo `repo`, para o electron-builder criar a release.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const desktopDir = join(repoRoot, "apps", "desktop");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    shell: process.platform === "win32",
    ...options,
  });
}

function capture(command, args) {
  return run(command, args, { capture: true }).trim();
}

function fail(message) {
  console.error(`\n  release: ${message}\n`);
  process.exit(1);
}

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  fail("uso: node scripts/release.mjs <x.y.z>");
}
const tag = `v${version}`;

// --- Portões -----------------------------------------------------------------------------------
// A release não passa por CI (só a `main` e os PRs passam), então estes são os únicos portões.

if (capture("git", ["status", "--porcelain"])) {
  fail("a árvore de trabalho está suja. Commite ou descarte antes de publicar.");
}

const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") {
  fail(`você está em '${branch}'. Uma release sai da main.`);
}

run("git", ["fetch", "origin", "main", "--tags"]);
if (capture("git", ["rev-parse", "HEAD"]) !== capture("git", ["rev-parse", "origin/main"])) {
  fail("sua main não está igual à origin/main. Faça pull (ou push) antes.");
}

const signalerUrl = process.env["MAIN_VITE_SIGNALER_URL"];
if (!signalerUrl) {
  fail("MAIN_VITE_SIGNALER_URL não está definida. Sem ela o instalador sai apontando para o .env.");
}
if (/localhost|127\.0\.0\.1/.test(signalerUrl)) {
  fail(`MAIN_VITE_SIGNALER_URL aponta para ${signalerUrl}. Esse instalador só funcionaria na sua máquina.`);
}
if (!signalerUrl.startsWith("wss://")) {
  fail(`MAIN_VITE_SIGNALER_URL é '${signalerUrl}'. O sinalizador precisa ser wss:// (spec 0002).`);
}
if (!process.env["GH_TOKEN"]) {
  fail("GH_TOKEN não está definida. O electron-builder precisa dela para criar a release.");
}

// A versão do package.json nunca é lida como verdade, mas se alguém a tiver bumpado à mão o
// `extraMetadata` silenciosamente venceria — melhor dizer isso em voz alta.
const desktopVersion = require(join(desktopDir, "package.json")).version;
if (desktopVersion !== "0.0.0") {
  fail(
    `apps/desktop/package.json está em ${desktopVersion}, e deveria estar em 0.0.0: a tag é a ` +
      "fonte da verdade (spec 0005). Reverta esse bump.",
  );
}

// --- Testes ------------------------------------------------------------------------------------

console.log(`\n== testes e typecheck ==\n`);
run("npm", ["run", "build", "-w", "@scrn-broadcast/protocol"]);
run("npm", ["run", "typecheck", "--workspaces", "--if-present"]);
run("npm", ["test", "--workspaces", "--if-present"]);

// --- Tag ---------------------------------------------------------------------------------------
// Idempotente: se a tag já existe, ela já foi empurrada por uma execução anterior que morreu
// depois deste ponto — segue direto para o build em vez de falhar.

const tagExists = capture("git", ["tag", "--list", tag]) === tag;
if (tagExists) {
  console.log(`\n== ${tag} já existe; seguindo para o build ==\n`);
} else {
  console.log(`\n== criando ${tag} ==\n`);
  run("git", ["tag", "-a", tag, "-m", `Telinha ${version}`]);
  run("git", ["push", "origin", tag]);
  console.log("\nA tag disparou o deploy do sinalizador. O instalador ainda vai levar alguns minutos.\n");
}

// --- Build e publicação ------------------------------------------------------------------------
// `--publish always` com o provider github cria a release como **rascunho** (padrão do
// electron-publish). Publicar é um botão seu, depois de conferir.

console.log(`\n== empacotando ${version} ==\n`);
run("npx", ["electron-vite", "build"], { cwd: desktopDir });
run(
  "npx",
  ["electron-builder", "--publish", "always", `--config.extraMetadata.version=${version}`],
  { cwd: desktopDir },
);

console.log(`
== ${tag} publicado como rascunho ==

  1. Abra a release em https://github.com/hmathsan/scrn-broadcast/releases
  2. Cole as notas a partir de .github/RELEASE_TEMPLATE.md
  3. Publique

O sinalizador já está no ar: confira em ${signalerUrl.replace(/^wss:/, "https:")}/version
`);
