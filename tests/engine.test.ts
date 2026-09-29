import { describe, expect, it } from "vitest";
import { T, verifyAnswer } from "@shared/engine";
import { harness, lesson, makePlan, qidOf, type Harness } from "./helpers";

/** the teacher answers the currently asked question (correct or not) */
function answer(h: Harness, correct: boolean, transcript = correct ? "osm" : "devět") {
  const qid = qidOf(h.last());
  expect(qid, "a question must have been asked").not.toBe("");
  return h.e.toolCall("record_answer", { question_id: qid, answer_transcript: transcript, is_correct: correct, feedback: "ok" });
}
/** finish EXPLAIN of the current part the way a well-behaved model does */
function explain(h: Harness) {
  h.wait(200 * 0.75);
  h.e.toolCall("part_explained", {});
  h.wait(2);
}

describe("verifyAnswer", () => {
  const short = { id: "x", type: "short" as const, prompt: "p", answer: "24", explanation: "e", sourceId: "Z1", source: "s" };
  it("accepts numbers spoken in words and overrides a wrong model verdict", () => {
    expect(verifyAnswer(short, "dvacet čtyři", false)).toBe(true);
    expect(verifyAnswer(short, "čtyřiadvacet", false)).toBe(true);
    expect(verifyAnswer(short, "je to 24", false)).toBe(true);
  });
  it("rejects a wrong number even if the model says correct", () => {
    expect(verifyAnswer(short, "dvacet pět", true)).toBe(false);
  });
  it("trusts the model for non-numeric answers", () => {
    const w = { ...short, answer: "činitel" };
    expect(verifyAnswer(w, "ten činitel", true)).toBe(true);
    expect(verifyAnswer(w, "součin", false)).toBe(false);
  });
});

describe("lesson flow", () => {
  it("starts with the first part's EXPLAIN when there is no warm-up", () => {
    const h = harness();
    h.e.start();
    expect(h.e.state.phase).toBe("EXPLAIN");
    expect(h.last()).toContain("STAV: EXPLAIN");
    expect(h.last()).toContain("část 1 z 5");
  });

  it("does not accept part_explained too early and asks the teacher to continue", () => {
    const h = harness();
    h.e.start();
    h.wait(30);
    const n = h.sent.length;
    h.e.toolCall("part_explained", {});
    h.wait(3);
    expect(h.e.state.phase).toBe("EXPLAIN");
    expect(h.sent.length).toBeGreaterThan(n);
    expect(h.last()).toContain("příliš brzy");
  });

  it("nudges when the teacher falls silent early, then moves on after the minimum time", () => {
    const h = harness();
    h.e.start();
    h.wait(T.idleNudge + 1);
    expect(h.last()).toContain("příliš brzy");
    h.wait(200 * T.minExplainRatio);
    h.wait(T.idleNudge + 3);
    expect(h.e.state.phase).toBe("CHECK");
  });

  it("wraps up an over-long explanation and finally forces the next step", () => {
    const h = harness();
    h.e.start();
    h.e.setModelSpeaking(true);
    h.wait(200 * T.wrapUpRatio + 2);
    expect(h.sent.some((s) => s.includes("Čas této části téměř vypršel"))).toBe(true);
    h.wait(200 * 0.5);
    h.e.setModelSpeaking(false);
    h.wait(6);
    expect(h.e.state.phase).toBe("CHECK");
  });

  it("asks check questions one at a time, records answers and continues through all parts to the final quiz", () => {
    const h = harness();
    h.e.start();
    for (let part = 0; part < 5; part++) {
      expect(h.e.state.phase).toBe("EXPLAIN");
      explain(h);
      expect(h.e.state.phase).toBe("CHECK");
      for (let k = 0; k < 2; k++) {
        expect(qidOf(h.last())).toBe(`9.1:p${part + 1}:q${k + 1}`);
        answer(h, true);
        h.wait(3);
      }
      expect(h.e.state.phase).toBe("FEEDBACK");
      h.e.toolCall("request_next_step", {});
      h.wait(2);
    }
    expect(h.e.state.phase).toBe("FINAL_QUIZ");
    expect(h.answers.filter((a) => a.context === "check")).toHaveLength(10);
  });

  it("completes the lesson at >= 75 % and reports the score", () => {
    const h = harness();
    h.e.start();
    // jump: run through quickly by feeding correct answers
    for (let i = 0; i < 5; i++) {
      explain(h);
      for (let k = 0; k < 2; k++) { answer(h, true); h.wait(3); }
      h.e.toolCall("request_next_step", {});
      h.wait(2);
    }
    for (let i = 0; i < 10; i++) { answer(h, i < 8); h.wait(3); } // 8/10 correct
    expect(h.e.state.phase).toBe("SUMMARY");
    expect(h.last()).toContain("80 %");
    h.e.toolCall("lesson_complete", { score: 0.8 });
    expect(h.completed).toHaveLength(1);
    expect(h.completed[0].score).toBeCloseTo(0.8);
    expect(h.e.state.phase).toBe("DONE");
  });

  it("the app, not the model, decides correctness of numeric answers", () => {
    const h = harness();
    h.e.start();
    explain(h);
    answer(h, false, "osm"); // the model wrongly says false, the child said "eight"
    expect(h.answers[0].correct).toBe(true);
  });

  it("ignores record_answer for a question that is not the current one", () => {
    const h = harness();
    h.e.start();
    explain(h);
    const r = h.e.toolCall("record_answer", { question_id: "9.1:f:q3", answer_transcript: "x", is_correct: true, feedback: "" });
    expect(r.ok).toBe(false);
    expect(h.answers).toHaveLength(0);
  });
});

describe("silence handling", () => {
  function atFirstQuestion() {
    const h = harness();
    h.e.start();
    explain(h);
    expect(h.e.state.phase).toBe("CHECK");
    return h;
  }
  it("rephrases at ~20 s, hints at ~45 s, reveals and moves on at ~70 s", () => {
    const h = atFirstQuestion();
    const n = h.sent.length;
    h.wait(T.rephrase);
    expect(h.sent[n]).toContain("zopakuj jinými slovy");
    h.wait(T.hint - T.rephrase);
    expect(h.sent[n + 1]).toContain("nápovědu");
    h.wait(T.reveal - T.hint);
    expect(h.sent[n + 2]).toContain("Čas na odpověď vypršel");
    expect(h.answers).toHaveLength(1);
    expect(h.answers[0]).toMatchObject({ correct: false, revealed: true });
    h.wait(3);
    expect(qidOf(h.last())).toBe("9.1:p1:q2");
  });
  it("does not count time while the teacher is speaking", () => {
    const h = atFirstQuestion();
    const n = h.sent.length;
    h.e.setModelSpeaking(true);
    h.wait(60);
    expect(h.sent.length).toBe(n);
  });
  it("pause freezes every timer", () => {
    const h = atFirstQuestion();
    h.e.pause();
    const n = h.sent.length;
    const before = h.e.state.totalSeconds;
    h.wait(300);
    expect(h.sent.length).toBe(n);
    expect(h.e.state.totalSeconds).toBe(before);
    h.e.resume();
    h.wait(T.rephrase);
    expect(h.sent.some((s) => s.includes("zopakuj jinými slovy"))).toBe(true);
  });
  it("constant background noise cannot freeze the lesson", () => {
    const h = atFirstQuestion();
    h.e.setUserSpeaking(true); // e.g. a fan: the "speaking" signal never ends
    const n = h.sent.length;
    h.wait(T.noiseCap + T.rephrase + 2);
    expect(h.sent.length).toBeGreaterThan(n);
  });
  it("noise alone is never treated as an answer", () => {
    const h = atFirstQuestion();
    h.e.setUserSpeaking(true);
    h.wait(40);
    expect(h.answers).toHaveLength(0);
    expect(h.sent.some((s) => s.includes("nezavolal jsi record_answer"))).toBe(false);
  });
  it("asks the teacher to evaluate when the child answered but no record_answer came", () => {
    const h = atFirstQuestion();
    h.e.noteUserTranscript();
    h.wait(T.evalNudge + 1);
    expect(h.last()).toContain("nezavolal jsi record_answer");
  });
});

describe("mastery, review and retest", () => {
  function toFinalQuiz(h: Harness) {
    h.e.start();
    for (let i = 0; i < 5; i++) {
      explain(h);
      for (let k = 0; k < 2; k++) { answer(h, true); h.wait(3); }
      h.e.toolCall("request_next_step", {});
      h.wait(2);
    }
    expect(h.e.state.phase).toBe("FINAL_QUIZ");
  }
  it("below 75 %: targeted review of the weakest parts, then a retest of the missed questions", () => {
    const h = harness();
    toFinalQuiz(h);
    for (let i = 0; i < 10; i++) { answer(h, i >= 4); h.wait(3); } // 6/10
    expect(h.e.state.phase).toBe("REVIEW");
    expect(h.e.state.reviewRound).toBe(1);
    expect(h.e.state.retestIds).toEqual(["9.1:f:q1", "9.1:f:q2", "9.1:f:q3", "9.1:f:q4"]);
    expect(h.last()).toContain("krátké opakování");
    h.e.toolCall("request_next_step", {});
    h.wait(2);
    expect(h.e.state.phase).toBe("RETEST");
    for (let i = 0; i < 4; i++) { answer(h, true); h.wait(3); }
    expect(h.e.state.phase).toBe("SUMMARY"); // 10/10 after fixing the missed ones
    expect(h.e.state.finalCorrect).toBe(10);
  });
  it("after three failed rounds the lesson is closed and the weak items are handed to the spaced-repetition queue", () => {
    const h = harness();
    toFinalQuiz(h);
    for (let i = 0; i < 10; i++) { answer(h, false); h.wait(3); }
    for (let round = 1; round <= 3; round++) {
      expect(h.e.state.phase).toBe("REVIEW");
      expect(h.e.state.reviewRound).toBe(round);
      h.e.toolCall("request_next_step", {});
      h.wait(2);
      expect(h.e.state.phase).toBe("RETEST");
      const n = h.e.state.retestIds.length;
      for (let i = 0; i < n; i++) { answer(h, false); h.wait(3); }
    }
    expect(h.e.state.phase).toBe("SUMMARY");
    expect(h.last()).toContain("uzavíráme");
    h.e.toolCall("lesson_complete", { score: 0 });
    expect(h.completed[0].weak.length).toBe(10); // every still-wrong quiz question stays in the SRS queue
  });
});

describe("warm-up and resume", () => {
  const warm = (id: string) => ({ ...makePlan().parts[0].questions[0], id, lessonId: "1.1" });
  it("runs warm-up questions first, one at a time", () => {
    const h = harness({ warmup: [warm("1.1:p1:q1"), warm("1.1:p2:q1")] });
    h.e.start();
    expect(h.e.state.phase).toBe("WARMUP");
    expect(h.sent[0]).toContain("WARMUP");
    expect(qidOf(h.last())).toBe("1.1:p1:q1");
    answer(h, true);
    h.wait(3);
    expect(qidOf(h.last())).toBe("1.1:p2:q1");
    answer(h, false);
    h.wait(3);
    expect(h.e.state.phase).toBe("EXPLAIN");
    expect(h.answers.map((a) => a.context)).toEqual(["warmup", "warmup"]);
  });
  it("resumes at the same part and question after a restart", () => {
    const a = harness();
    a.e.start();
    explain(a);
    answer(a, true);
    a.wait(3);
    const saved = structuredClone(a.saved[a.saved.length - 1]);
    expect(saved.phase).toBe("CHECK");
    const b = harness({ state: saved });
    b.e.start();
    expect(b.e.state.phase).toBe("CHECK");
    expect(qidOf(b.last())).toBe("9.1:p1:q2"); // q1 was already answered
    expect(b.last()).toContain("Navazuješ po přerušení");
  });
  it("resync re-sends the current instruction without resetting progress", () => {
    const h = harness();
    h.e.start();
    h.wait(50);
    const t = h.e.state.phaseSeconds;
    h.e.resync();
    expect(h.last()).toContain("STAV: EXPLAIN");
    expect(h.e.state.phaseSeconds).toBe(t);
  });
  it("uses the lesson definition in messages", () => {
    const h = harness();
    h.e.start();
    expect(h.last()).toContain("Text.");
    expect(lesson.id).toBe("9.1");
  });
});
