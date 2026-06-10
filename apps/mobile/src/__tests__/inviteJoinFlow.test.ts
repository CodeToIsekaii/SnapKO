import {
  getJoinErrorMessage,
  runOnceInFlight,
  unwrapJoinPayload,
} from "../screens/inviteJoin.utils";

describe("InviteJoin API helpers", () => {
  it("unwraps payload when backend returns envelope { data }", () => {
    const raw = {
      data: {
        profileId: "profile-1",
        accessToken: "access",
        refreshToken: "refresh",
      },
      status: 201,
      message: "success",
    };

    const payload = unwrapJoinPayload(raw);
    expect(payload.profileId).toBe("profile-1");
    expect(payload.accessToken).toBe("access");
    expect(payload.refreshToken).toBe("refresh");
  });

  it("keeps payload when backend returns flat object", () => {
    const raw = {
      profileId: "profile-2",
      accessToken: "access-flat",
      refreshToken: "refresh-flat",
    };

    const payload = unwrapJoinPayload(raw);
    expect(payload.profileId).toBe("profile-2");
    expect(payload.accessToken).toBe("access-flat");
  });

  it("prefers message over error when extracting backend error", () => {
    const err = getJoinErrorMessage({
      message: "Mã mời đã hết lượt sử dụng",
      error: "Bad Request",
      statusCode: 400,
    });
    expect(err).toBe("Mã mời đã hết lượt sử dụng");
  });

  it("falls back to error if message is absent", () => {
    const err = getJoinErrorMessage({ error: "Bad Request" });
    expect(err).toBe("Bad Request");
  });

  it("blocks duplicate submit while first submit is in-flight", async () => {
    const guard = { current: false };
    let calls = 0;

    const task = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "ok";
    };

    const first = runOnceInFlight(guard, task);
    const second = runOnceInFlight(guard, task);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toBe("ok");
    expect(secondResult).toBeNull();
    expect(calls).toBe(1);
  });
});
