import { describe, expect, it } from "vitest";
import { createAssistantTurnCoalescer } from "./assistant-turn-coalescer";
import { sanitizeTtsText } from "./tts-text-sanitizer";

const QUESTION_A =
  "行動して初めて成果が出る、という点が大事なんですね。最近の事業の中で、その考えが強く表れた具体的な場面はどこでしたか。";
const QUESTION_B =
  "KPIを越えたのが、はっきりしたサインだったんですね。その時に見た数字は、たとえば申し込みや問い合わせなど、何の指標でしたか。";

describe("createAssistantTurnCoalescer", () => {
  it("speaks only the last response of a turn", () => {
    const coalescer = createAssistantTurnCoalescer();
    coalescer.noteUserTurn();

    coalescer.noteResponseStart();
    coalescer.noteResponseComplete(QUESTION_A, { hadToolCall: true });

    coalescer.noteResponseStart();
    coalescer.noteResponseComplete(QUESTION_B);

    expect(coalescer.flush()).toEqual({
      id: "assistant-turn-1",
      text: sanitizeTtsText(QUESTION_B),
    });
    // One utterance per turn: a second flush yields nothing.
    expect(coalescer.flush()).toBeNull();
  });

  it("concatenates multiple text items within a single response", () => {
    const coalescer = createAssistantTurnCoalescer();
    coalescer.noteUserTurn();

    coalescer.noteResponseStart();
    coalescer.noteDelta("作って終わりにしない、という点が具体的ですね。");
    coalescer.noteDelta("最初に増えたのは、どんな場面でしたか。");
    coalescer.noteResponseComplete();

    expect(coalescer.flush()?.text).toBe(
      sanitizeTtsText(
        "作って終わりにしない、という点が具体的ですね。最初に増えたのは、どんな場面でしたか。"
      )
    );
  });

  it("resets the candidate when a new user turn starts", () => {
    const coalescer = createAssistantTurnCoalescer();
    coalescer.noteUserTurn();
    coalescer.noteResponseStart();
    coalescer.noteResponseComplete(QUESTION_A);

    coalescer.noteUserTurn();
    expect(coalescer.flush()).toBeNull();
  });

  it("lets a later real question supersede an earlier tool-call response", () => {
    const coalescer = createAssistantTurnCoalescer();
    coalescer.noteUserTurn();

    coalescer.noteResponseStart();
    coalescer.noteResponseComplete("そこから先を、一緒にたどってみます", {
      hadToolCall: true,
    });

    coalescer.noteResponseStart();
    coalescer.noteResponseComplete(QUESTION_B);

    expect(coalescer.flush()?.text).toBe(sanitizeTtsText(QUESTION_B));
  });

  it("never lets a tool-call response override a real answer already captured", () => {
    const coalescer = createAssistantTurnCoalescer();
    coalescer.noteUserTurn();

    coalescer.noteResponseStart();
    coalescer.noteResponseComplete(QUESTION_A);

    coalescer.noteResponseStart();
    coalescer.noteResponseComplete("そこから先を、一緒にたどってみます", {
      hadToolCall: true,
    });

    expect(coalescer.flush()?.text).toBe(sanitizeTtsText(QUESTION_A));
  });

  it("never speaks a tool-call response that is pure narration (no question)", () => {
    const coalescer = createAssistantTurnCoalescer();
    coalescer.noteUserTurn();

    coalescer.noteResponseStart();
    // A bridge / internal monologue emitted alongside the tool call, with no
    // actual question, must never be voiced — even as the turn's only response.
    coalescer.noteResponseComplete("そこから先を、一緒にたどってみます", {
      hadToolCall: true,
    });

    expect(coalescer.flush()).toBeNull();
  });

  it("still speaks a tool-call response when it carries a real question", () => {
    const coalescer = createAssistantTurnCoalescer();
    coalescer.noteUserTurn();

    coalescer.noteResponseStart();
    coalescer.noteResponseComplete(QUESTION_A, { hadToolCall: true });

    expect(coalescer.flush()?.text).toBe(sanitizeTtsText(QUESTION_A));
  });

  it("drops the pending candidate on cancel (barge-in)", () => {
    const coalescer = createAssistantTurnCoalescer();
    coalescer.noteUserTurn();
    coalescer.noteResponseStart();
    coalescer.noteResponseComplete(QUESTION_A);

    coalescer.cancel();
    expect(coalescer.flush()).toBeNull();
  });

  it("returns null for meta-only or empty responses", () => {
    const coalescer = createAssistantTurnCoalescer();
    coalescer.noteUserTurn();

    coalescer.noteResponseStart();
    coalescer.noteResponseComplete("承知しました。");
    expect(coalescer.flush()).toBeNull();

    coalescer.noteUserTurn();
    coalescer.noteResponseStart();
    coalescer.noteResponseComplete("");
    expect(coalescer.flush()).toBeNull();
  });

  it("keeps an existing candidate when a later response is meta-only", () => {
    const coalescer = createAssistantTurnCoalescer();
    coalescer.noteUserTurn();

    coalescer.noteResponseStart();
    coalescer.noteResponseComplete(QUESTION_A);

    coalescer.noteResponseStart();
    coalescer.noteResponseComplete("承知しました。");

    expect(coalescer.flush()?.text).toBe(sanitizeTtsText(QUESTION_A));
  });
});
