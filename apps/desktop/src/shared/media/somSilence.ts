/**
 * Captura bem-sucedida em silêncio é indistinguível de app calado — e é justamente como o caso da
 * Loja e uma string não documentada que parou de funcionar se manifestam (ADR 0011). Este rastreador
 * só decide quando vale uma linha de log; não vira aviso na tela, porque silêncio pode ser legítimo.
 */

/** Quanto silêncio contínuo até `som-capture-silent`. */
export const SOM_SILENT_LOG_MS = 60_000;

/** `audioLevel` abaixo disto conta como silêncio. O WebRTC entrega 0..1, linear. */
export const SOM_SILENT_LEVEL = 0.0001;

export class SomSilenceTracker {
  private silentSince: number | null = null;
  private reportedSilent = false;

  /** Devolve a transição, quando houver uma. `null` em `audioLevel` não conta nem zera. */
  observe(audioLevel: number | null, now: number): "went-silent" | "sound-returned" | null {
    if (audioLevel === null) return null;

    if (audioLevel >= SOM_SILENT_LEVEL) {
      this.silentSince = null;
      if (!this.reportedSilent) return null;
      this.reportedSilent = false;
      return "sound-returned";
    }

    this.silentSince ??= now;
    if (this.reportedSilent || now - this.silentSince < SOM_SILENT_LOG_MS) return null;
    this.reportedSilent = true;
    return "went-silent";
  }

  /** Há quanto tempo o silêncio atual dura. `0` quando há som. */
  silentForMs(now: number): number {
    return this.silentSince === null ? 0 : now - this.silentSince;
  }

  reset(): void {
    this.silentSince = null;
    this.reportedSilent = false;
  }
}
