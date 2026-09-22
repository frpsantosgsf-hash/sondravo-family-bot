/**
 * Gedeelde besturing voor de intro-lus. De HeroStage weet niet of het
 * fragment van YouTube komt of uit een eigen bestand — hij stuurt alleen deze
 * drie opdrachten.
 */
export interface ClipHandle {
  /** Spoel naar dit punt en speel af. */
  play: (fromSeconds: number) => void;
  pause: () => void;
  setMuted: (muted: boolean) => void;
}
