const BACKGROUND_INTERRUPTION_MESSAGE =
  "Quét bị gián đoạn vì app rời màn hình. Ở lại màn quét đến khi xong rồi quét lại nhé.";

const NETWORK_FAILURE_MESSAGE =
  "Không kết nối được server khi quét. Kiểm tra mạng/server rồi quét lại.";

const TIMEOUT_MESSAGE = "Quá thời gian chờ. Kiểm tra kết nối mạng và thử lại.";

const SERVER_TIMEOUT_MESSAGE =
  "Server xử lý ảnh quá lâu. Bạn thử lại với ảnh rõ hơn, ít ảnh hơn hoặc chờ vài phút rồi quét lại.";

function isHtmlErrorMessage(message: string): boolean {
  return /<!doctype html|<html|<body|<\/html>/i.test(message);
}

function isServerTimeoutMessage(message: string): boolean {
  return /504|502|503|gateway time-?out|timeout|timed out/i.test(message);
}

export function isExpectedNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /network request failed|fetch failed/i.test(message);
}

export function formatParseErrorMessage(
  error: unknown,
  interruptedByBackground: boolean,
): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error || "");

  if (name === "AbortError") {
    return TIMEOUT_MESSAGE;
  }

  if (isExpectedNetworkError(error)) {
    return interruptedByBackground
      ? BACKGROUND_INTERRUPTION_MESSAGE
      : NETWORK_FAILURE_MESSAGE;
  }

  if (isHtmlErrorMessage(message) || isServerTimeoutMessage(message)) {
    return SERVER_TIMEOUT_MESSAGE;
  }

  return message || "Có lỗi xảy ra";
}
