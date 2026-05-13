export interface GeminiLiveConnectionUiState {
  statusLabel: string;
  statusTone: "success" | "warning" | "error";
  notice: string | null;
  detail: string | null;
  canResume: boolean;
}

export interface GeminiLiveConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  resumeFailed: boolean;
  goAwayTimeLeft: string | null;
  hasResumableSession: boolean;
}

export interface GeminiUnexpectedCloseState {
  isManualDisconnect: boolean;
  isResumeInFlight: boolean;
  hasResumableSession: boolean;
}

export interface GeminiResumePromptState {
  isResumeSession: boolean;
  hasSentResumePrompt: boolean;
  isUserTurnActive: boolean;
}

export function parseGeminiGoAwaySeconds(value?: string | null): number | null {
  if (!value) return null;

  const match = value.match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;

  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds)) return null;

  return Math.ceil(seconds);
}

export function getGeminiLiveConnectionUi(
  state: GeminiLiveConnectionState
): GeminiLiveConnectionUiState {
  if (state.resumeFailed) {
    if (!state.hasResumableSession) {
      return {
        statusLabel: "接続切れ",
        statusTone: "error",
        notice:
          "Type 2 の接続が切れました。今回は再開ハンドルがなく、自動では戻せませんでした。",
        detail: null,
        canResume: false,
      };
    }

    return {
      statusLabel: "再開失敗",
      statusTone: "error",
      notice:
        "Type 2 の再開に失敗しました。再開ボタンから同じ面接状態のまま接続を戻せます。",
      detail: null,
      canResume: state.hasResumableSession,
    };
  }

  if (state.isReconnecting) {
    const seconds = parseGeminiGoAwaySeconds(state.goAwayTimeLeft);

    return {
      statusLabel: "再接続中",
      statusTone: "warning",
      notice:
        "接続を引き継いでいます。会話履歴は維持したまま数秒で再開します。",
      detail: seconds === null ? null : `切断まで残り約${seconds}秒`,
      canResume: false,
    };
  }

  return {
    statusLabel: state.isConnected ? "接続中" : state.isConnecting ? "接続中..." : "未接続",
    statusTone: state.isConnected ? "success" : state.isConnecting ? "warning" : "warning",
    notice: null,
    detail: null,
    canResume: false,
  };
}

export function getGeminiUnexpectedCloseAction(
  state: GeminiUnexpectedCloseState
): "ignore" | "resume" | "fail" {
  if (state.isManualDisconnect || state.isResumeInFlight) {
    return "ignore";
  }

  if (state.hasResumableSession) {
    return "resume";
  }

  return "fail";
}

export function getGeminiResumePromptAction(
  state: GeminiResumePromptState
): "send" | "defer" | "skip" {
  if (!state.isResumeSession || state.hasSentResumePrompt) {
    return "skip";
  }

  if (state.isUserTurnActive) {
    return "defer";
  }

  return "send";
}
