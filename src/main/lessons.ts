import { EventEmitter } from "node:events";
import type { Overview, OpenLesson, PlanProgress } from "@shared/ipc";
import { newLessonState } from "@shared/engine";
import type { Curriculum, LessonDef, LessonState, Plan, WarmupQuestion } from "@shared/types";
import { MASTERY } from "@shared/types";
import type { Store } from "./db";
import { getApiKey } from "./secrets";
import { getSettings } from "./settings";
import { czechError } from "./gemini";
import { generatePlan } from "./planner";
import log from "./log";

export class LessonService extends EventEmitter {
  private running = new Map<string, Promise<Plan>>();
  private all: (LessonDef & { stageId: number; stageTitle: string })[];

  constructor(
    readonly store: Store,
    readonly curriculum: Curriculum,
    private generate: typeof generatePlan = generatePlan,
  ) {
    super();
    this.all = curriculum.stages.flatMap((s) => s.lessons.map((l) => ({ ...l, stageId: s.id, stageTitle: s.title })));
  }

  lessonById(id: string) {
    return this.all.find((l) => l.id === id);
  }
  currentLessonId(): string | null {
    const done = new Set(this.store.completedIds());
    return this.all.find((l) => !done.has(l.id))?.id ?? null;
  }
  nextOf(id: string) {
    const i = this.all.findIndex((l) => l.id === id);
    return i >= 0 ? (this.all[i + 1] ?? null) : null;
  }

  overview(): Overview {
    const done = new Set(this.store.completedIds());
    const progress = new Map(this.store.allProgress().map((p) => [p.lesson_id, p]));
    const current = this.currentLessonId();
    return {
      subject: this.curriculum.subject,
      currentLessonId: current,
      completed: done.size,
      total: this.all.length,
      srsDue: this.store.srsCount(),
      stages: this.curriculum.stages.map((s) => ({
        id: s.id,
        title: s.title,
        lessons: s.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          status: done.has(l.id) ? "completed" : l.id === current ? "current" : "locked",
          inProgress: progress.get(l.id)?.status === "in_progress",
          score: progress.get(l.id)?.score ?? null,
        })),
      })),
    };
  }

  planReady(lessonId: string) {
    return !!this.store.getPlan(lessonId);
  }
  planGenerating(lessonId: string) {
    return this.running.has(lessonId);
  }

  /** Returns the stored plan; generates it once if missing. Concurrent callers share one run. A started plan is never regenerated. */
  ensurePlan(lessonId: string): Promise<Plan> {
    const existing = this.store.getPlan(lessonId);
    if (existing) return Promise.resolve(existing.plan);
    let run = this.running.get(lessonId);
    if (run) return run;
    const lesson = this.lessonById(lessonId);
    if (!lesson) return Promise.reject(new Error("Neznámá lekce."));
    run = (async () => {
      const key = await getApiKey();
      if (!key) throw new Error("Chybí Gemini API klíč.");
      const emit = (step: string, done: number, total: number) => this.emit("progress", { lessonId, step, done, total } satisfies PlanProgress);
      try {
        const plan = await this.generate({ key, model: getSettings().PREP_MODEL, curriculum: this.curriculum, lesson, onProgress: emit });
        this.store.savePlan(plan);
        log.info(`plan ${lessonId} generated (${plan.parts.length} parts, ${plan.finalQuiz.length} quiz questions, ${plan.flags.length} flags)`);
        return plan;
      } catch (e) {
        log.error(`plan ${lessonId} failed`, e);
        throw new Error(czechError(e));
      } finally {
        this.running.delete(lessonId);
      }
    })();
    this.running.set(lessonId, run);
    return run;
  }

  prefetchNext(lessonId: string) {
    const next = this.nextOf(lessonId);
    if (!next || this.store.getPlan(next.id) || this.running.has(next.id)) return;
    this.ensurePlan(next.id).catch((e) => log.warn(`background plan ${next.id} failed: ${e.message}`));
  }

  private warmupFor(lessonId: string): WarmupQuestion[] {
    const idx = this.all.findIndex((l) => l.id === lessonId);
    const earlier = this.all.slice(0, Math.max(idx, 0)).map((l) => l.id);
    const rows = this.store.dueSrs(earlier, 4);
    const out: WarmupQuestion[] = [];
    for (const r of rows) {
      const plan = this.store.getPlan(r.lessonId)?.plan;
      const q = plan && [...plan.parts.flatMap((p) => p.questions), ...plan.finalQuiz].find((x) => x.id === r.qid);
      if (q) out.push({ ...q, lessonId: r.lessonId });
    }
    return out;
  }

  async openLesson(lessonId: string): Promise<OpenLesson> {
    const lesson = this.lessonById(lessonId);
    if (!lesson) throw new Error("Neznámá lekce.");
    if (this.currentLessonId() !== lessonId) throw new Error("Tato lekce ještě není odemčená.");
    const plan = await this.ensurePlan(lessonId);
    const progress = this.store.getProgress(lessonId);
    let state: LessonState;
    let warmup: WarmupQuestion[];
    let resumed = false;
    if (progress?.status === "in_progress" && progress.state_json) {
      state = JSON.parse(progress.state_json) as LessonState;
      // warm-up items are re-resolved from the ids stored in the state so a resumed lesson asks the same questions
      warmup = state.warmupIds
        .map((qid) => {
          const l = qid.split(":")[0];
          const p = this.store.getPlan(l)?.plan;
          const q = p && [...p.parts.flatMap((x) => x.questions), ...p.finalQuiz].find((x) => x.id === qid);
          return q ? ({ ...q, lessonId: l } as WarmupQuestion) : null;
        })
        .filter((x): x is WarmupQuestion => !!x);
      resumed = true;
    } else {
      warmup = this.warmupFor(lessonId);
      state = newLessonState(lessonId, warmup.map((w) => w.id));
      this.store.saveState(state);
    }
    this.store.markPlanStarted(lessonId);
    const stage = this.curriculum.stages.find((s) => s.lessons.some((l) => l.id === lessonId))!;
    return { lesson, stageTitle: stage.title, plan, state, warmup, nextTitle: this.nextOf(lessonId)?.title ?? null, resumed };
  }

  complete(lessonId: string, score: number, weakIds: string[]) {
    this.store.completeLesson(lessonId, score);
    // weak items stay in the spaced-repetition queue
    for (const qid of weakIds) this.store.updateSrs(qid, lessonId, false);
    this.prefetchNext(lessonId);
    log.info(`lesson ${lessonId} completed, score ${score.toFixed(2)} (mastery ${MASTERY})`);
  }

  jumpTo(lessonId: string) {
    const idx = this.all.findIndex((l) => l.id === lessonId);
    if (idx < 0) return;
    const done = new Set(this.store.completedIds());
    this.store.db.transaction(() => {
      this.all.forEach((l, i) => {
        if (i < idx && !done.has(l.id)) this.store.completeLesson(l.id, null);
        if (i >= idx) this.store.db.prepare("DELETE FROM lesson_progress WHERE lesson_id = ?").run(l.id);
      });
    })();
  }
}
