import { runInventorySaveOperation } from "../screens/inventoryCaptureSave";

describe("runInventorySaveOperation", () => {
  it("reports errors thrown before persistence and always finishes the save state", async () => {
    const error = new Error("Không thể quy đổi Túi sang kg");
    const onError = jest.fn();
    const onFinally = jest.fn();

    await runInventorySaveOperation(
      async () => {
        throw error;
      },
      onError,
      onFinally,
    );

    expect(onError).toHaveBeenCalledWith(error);
    expect(onFinally).toHaveBeenCalledTimes(1);
  });
});
