import { buildSystemInstruction } from "@shared/prompts";
import type { AppSettings, LessonDef, Plan } from "@shared/types";

const str = (description: string) => ({ type: "STRING", description });

/** Function declarations exposed to the live teacher. The app (not the model) is the source of truth. */
export const TOOL_DECLARATIONS = [
  { name: "part_explained", description: "Zavolej, až jsi opravdu dokončil výklad celé aktuální části (včetně shrnutí).", parameters: { type: "OBJECT", properties: {} } },
  {
    name: "record_answer",
    description: "Zaznamená vyhodnocenou odpověď dítěte na jednu otázku z pokynu [LESSON CONTROL].",
    parameters: {
      type: "OBJECT",
      properties: {
        question_id: str("id otázky z pokynu"),
        answer_transcript: str("doslovná odpověď dítěte"),
        is_correct: { type: "BOOLEAN", description: "true, pokud je odpověď věcně správná" },
        feedback: str("tvoje krátká zpětná vazba česky"),
      },
      required: ["question_id", "answer_transcript", "is_correct", "feedback"],
    },
  },
  { name: "request_next_step", description: "Zavolej, když je aktuální krok (např. shrnutí části, opakování, rozcvička) hotový a čekáš na další pokyn.", parameters: { type: "OBJECT", properties: {} } },
  {
    name: "flag_uncertain",
    description: "Zavolej, pokud si nejsi jistý, že něco opravdu je ve studijním materiálu.",
    parameters: { type: "OBJECT", properties: { topic: str("téma, o kterém nejsi jistý") }, required: ["topic"] },
  },
  {
    name: "lesson_complete",
    description: "Zavolej až na výslovný pokyn ke konci lekce.",
    parameters: { type: "OBJECT", properties: { score: { type: "NUMBER", description: "podíl správných odpovědí 0 až 1" } }, required: ["score"] },
  },
];

/** The part of LiveConnectConfig that is locked into the ephemeral token (the renderer cannot change it). */
export function buildLiveConfig(o: { subject: string; age: number; level?: string; notes?: string; lesson: LessonDef; plan: Plan; settings: AppSettings; stateSummary?: string }) {
  const config: Record<string, unknown> = {
    responseModalities: ["AUDIO"],
    systemInstruction: buildSystemInstruction({ subject: o.subject, age: o.age, level: o.level, notes: o.notes, lesson: o.lesson, plan: o.plan, stateSummary: o.stateSummary }),
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // Push-to-talk: no server-side voice detection. The app brackets every answer with activityStart / activityEnd,
    // and only audio sent in between counts. A new activityStart interrupts the tutor (START_OF_ACTIVITY_INTERRUPTS).
    realtimeInputConfig: {
      automaticActivityDetection: { disabled: true },
      activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
      turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
    },
  };
  if (o.settings.VOICE) config.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.settings.VOICE } } };
  return config;
}
