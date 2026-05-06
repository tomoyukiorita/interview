import { describe, expect, it } from "vitest";

import {
  getGeminiUnexpectedCloseAction,
  getGeminiResumePromptAction,
  getGeminiLiveConnectionUi,
  parseGeminiGoAwaySeconds,
} from "./gemini-live-connection";

describe("gemini live connection helpers", () => {
  it("parses goAway timeLeft durations expressed in seconds", () => {
    expect(parseGeminiGoAwaySeconds("12s")).toBe(12);
    expect(parseGeminiGoAwaySeconds("1.5s")).toBe(2);
    expect(parseGeminiGoAwaySeconds(undefined)).toBeNull();
    expect(parseGeminiGoAwaySeconds("not-a-duration")).toBeNull();
  });

  it("returns a reconnecting UI state while the session is being resumed", () => {
    expect(
      getGeminiLiveConnectionUi({
        isConnected: true,
        isConnecting: false,
        isReconnecting: true,
        resumeFailed: false,
        goAwayTimeLeft: "9s",
        hasResumableSession: true,
      })
    ).toEqual({
      statusLabel: "再接続中",
      statusTone: "warning",
      notice:
        "接続を引き継いでいます。会話履歴は維持したまま数秒で再開します。",
      detail: "切断まで残り約9秒",
      canResume: false,
    });
  });

  it("returns a retryable error UI state after resumption fails", () => {
    expect(
      getGeminiLiveConnectionUi({
        isConnected: false,
        isConnecting: false,
        isReconnecting: false,
        resumeFailed: true,
        goAwayTimeLeft: null,
        hasResumableSession: true,
      })
    ).toEqual({
      statusLabel: "再開失敗",
      statusTone: "error",
      notice:
        "Gemini Live の再開に失敗しました。再開ボタンから同じ面接状態のまま接続を戻せます。",
      detail: null,
      canResume: true,
    });
  });

  it("returns a non-retryable error UI state when no resume handle exists", () => {
    expect(
      getGeminiLiveConnectionUi({
        isConnected: false,
        isConnecting: false,
        isReconnecting: false,
        resumeFailed: true,
        goAwayTimeLeft: null,
        hasResumableSession: false,
      })
    ).toEqual({
      statusLabel: "接続切れ",
      statusTone: "error",
      notice:
        "Gemini Live の接続が切れました。今回は再開ハンドルがなく、自動では戻せませんでした。",
      detail: null,
      canResume: false,
    });
  });

  it("returns the default connected UI state when no reconnect is happening", () => {
    expect(
      getGeminiLiveConnectionUi({
        isConnected: true,
        isConnecting: false,
        isReconnecting: false,
        resumeFailed: false,
        goAwayTimeLeft: null,
        hasResumableSession: false,
      })
    ).toEqual({
      statusLabel: "接続中",
      statusTone: "success",
      notice: null,
      detail: null,
      canResume: false,
    });
  });

  it("retries automatically when the socket closes unexpectedly but a resume handle exists", () => {
    expect(
      getGeminiUnexpectedCloseAction({
        isManualDisconnect: false,
        isResumeInFlight: false,
        hasResumableSession: true,
      })
    ).toBe("resume");
  });

  it("surfaces failure when the socket closes unexpectedly without a resume handle", () => {
    expect(
      getGeminiUnexpectedCloseAction({
        isManualDisconnect: false,
        isResumeInFlight: false,
        hasResumableSession: false,
      })
    ).toBe("fail");
  });

  it("ignores expected closes during manual disconnects or active resumes", () => {
    expect(
      getGeminiUnexpectedCloseAction({
        isManualDisconnect: true,
        isResumeInFlight: false,
        hasResumableSession: true,
      })
    ).toBe("ignore");
    expect(
      getGeminiUnexpectedCloseAction({
        isManualDisconnect: false,
        isResumeInFlight: true,
        hasResumableSession: true,
      })
    ).toBe("ignore");
  });

  it("sends the resume prompt only once for resumed sessions", () => {
    expect(
      getGeminiResumePromptAction({
        isResumeSession: true,
        hasSentResumePrompt: false,
        isUserTurnActive: false,
      })
    ).toBe("send");
    expect(
      getGeminiResumePromptAction({
        isResumeSession: true,
        hasSentResumePrompt: true,
        isUserTurnActive: false,
      })
    ).toBe("skip");
  });

  it("skips the resume prompt for non-resumed sessions", () => {
    expect(
      getGeminiResumePromptAction({
        isResumeSession: false,
        hasSentResumePrompt: false,
        isUserTurnActive: false,
      })
    ).toBe("skip");
  });

  it("defers the resume prompt while the interviewee is still speaking", () => {
    expect(
      getGeminiResumePromptAction({
        isResumeSession: true,
        hasSentResumePrompt: false,
        isUserTurnActive: true,
      })
    ).toBe("defer");
  });
});
