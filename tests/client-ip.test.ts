import { describe, expect, it } from "vitest";
import { clientIp } from "../functions/src/limits";

const h = (xff?: string) => new Headers(xff === undefined ? {} : { "x-forwarded-for": xff });

describe("clientIp", () => {
  it("takes the address Hosting saw, not one the caller wrote", () => {
    expect(clientIp(h("203.0.113.7, 35.1.2.3"))).toBe("203.0.113.7");
    expect(clientIp(h("1.1.1.1, 203.0.113.7, 35.1.2.3"))).toBe("203.0.113.7");
    expect(clientIp(h("203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(h(""))).toBe("unknown");
    expect(clientIp(h())).toBe("unknown");
  });
});
