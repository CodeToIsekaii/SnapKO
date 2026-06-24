import {
  formatParseErrorMessage,
  isExpectedNetworkError,
} from "../screens/inventoryCaptureError";

describe("formatParseErrorMessage", () => {
  it("explains network failures caused by leaving the app during parsing", () => {
    expect(
      formatParseErrorMessage(new Error("Network request failed"), true),
    ).toBe(
      "Quét bị gián đoạn vì app rời màn hình. Ở lại màn quét đến khi xong rồi quét lại nhé.",
    );

    expect(formatParseErrorMessage(new Error("fetch failed"), true)).toBe(
      "Quét bị gián đoạn vì app rời màn hình. Ở lại màn quét đến khi xong rồi quét lại nhé.",
    );
  });

  it("uses a backend connection message for ordinary network failures", () => {
    expect(
      formatParseErrorMessage(new Error("Network request failed"), false),
    ).toBe("Không kết nối được server khi quét. Kiểm tra mạng/server rồi quét lại.");
  });

  it("keeps the timeout message for aborted requests", () => {
    const error = new Error("aborted");
    error.name = "AbortError";

    expect(formatParseErrorMessage(error, false)).toBe(
      "Quá thời gian chờ. Kiểm tra kết nối mạng và thử lại.",
    );
  });

  it("identifies expected fetch/network failures", () => {
    expect(isExpectedNetworkError(new Error("Network request failed"))).toBe(
      true,
    );
    expect(isExpectedNetworkError(new Error("fetch failed"))).toBe(true);
    expect(isExpectedNetworkError(new Error("Gemini down"))).toBe(false);
  });
});
