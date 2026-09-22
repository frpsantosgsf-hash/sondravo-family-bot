/**
 * Gedeelde besturing voor de intro-lus. De HeroStage weet niet of het
 * fragment van YouTube komt of uit een eigen bestand — hij stuurt alleen deze
 * opdrachten.
 */
export interface ClipHandle {
  /** Spoel naar dit punt en speel af. */
  play: (fromSeconds: number) => void;
  pause: () => void;
  setMuted: (muted: boolean) => void;
  /**
   * Totale lengte van de clip in seconden, of null zolang die nog onbekend
   * is. Nodig om het fragment aan het eind van de video te kunnen laten
   * beginnen zonder die lengte ergens hard in te typen.
   */
  getDuration: () => number | null;
}
