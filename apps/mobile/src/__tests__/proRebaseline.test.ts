import { getProRebaselineBannerMessage } from "../utils/proRebaseline";

describe("PRO rebaseline banner", () => {
  it("makes the remaining Bar step explicit after Warehouse is complete", () => {
    expect(
      getProRebaselineBannerMessage({
        required: true,
        warehouseDone: true,
        barDone: false,
      }),
    ).toBe("Kho tổng đã xong. Cần kiểm riêng Bar để hoàn tất khôi phục Kho Kép.");
  });
});
