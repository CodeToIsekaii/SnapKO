jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  manipulateAsync: jest.fn(),
}));

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    base64() {
      return "";
    }
  },
}));

jest.mock("../services/api", () => ({
  api: {
    post: jest.fn(),
  },
}));

import {
  confirmAiResultCharge,
  parseInvoiceMultiWithAI,
} from "../services/aiService";
import { api } from "../services/api";

describe("aiService expected network failures", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not call console.error for expected network failures", async () => {
    (api.post as jest.Mock).mockRejectedValueOnce(
      new Error("Network request failed"),
    );
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await parseInvoiceMultiWithAI(["base64-image"], "business-1");

    expect(result.success).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("posts the scan charge token to confirm-ai-result", async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({
      charged: true,
      quota: { used: 1, quota: 100, remaining: 99 },
    });

    await confirmAiResultCharge("scan-token");

    expect(api.post).toHaveBeenCalledWith("/scans/confirm-ai-result", {
      token: "scan-token",
    });
  });
});
