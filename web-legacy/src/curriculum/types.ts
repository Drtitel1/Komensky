export interface Passage {
  /** Stable id used to cite the source, e.g. "Z3". */
  id: string;
  text: string;
}

export interface LessonDef {
  id: string; // e.g. "1.2"
  title: string;
  objectives: string[];
  keyFacts: string[];
  /** The study material. The ONLY facts that may be taught or asked about. */
  passages: Passage[];
}

export interface StageDef {
  id: number;
  title: string;
  description: string;
  lessons: LessonDef[];
}
