import { describe, expect, it } from "vitest";
import {
  describeAttempt,
  failed,
  laterBy,
  signedInAfter,
  stillTrying,
  type SignInAttempt,
} from "./attempts-shared";

const ADA = "000000000001";
const BEN = "000000000002";
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 16, 12, minutes)).toISOString();
const attempt = (
  personId: string,
  minutes: number,
  outcome: SignInAttempt["outcome"] = "sent"
): SignInAttempt => ({
  at: at(minutes),
  personId,
  name: personId === ADA ? "Ada Ash" : "Ben Birch",
  kind: outcome === "made" ? "admin-link" : "email",
  outcome,
});

describe("tries at signing in", () => {
  it("says what happened, and which went wrong", () => {
    expect(describeAttempt({ ...attempt(ADA, 0), to: "a•••@example.org", detail: "Brevo" })).toBe(
      "Asked for a sign-in email: sent to a•••@example.org through Brevo"
    );
    expect(describeAttempt({ ...attempt(ADA, 0, "not-sent"), detail: "brevo 401" })).toBe(
      "Asked for a sign-in email: it couldn't be sent (brevo 401)"
    );
    expect(describeAttempt({ ...attempt(ADA, 0, "made"), by: "Finn Fir" })).toBe(
      "Finn Fir made a sign-in link for them"
    );
    expect(describeAttempt(attempt(ADA, 0, "expired"))).toBe(
      "Opened a sign-in link that had expired"
    );
    expect(failed(attempt(ADA, 0))).toBe(false);
    expect(failed(attempt(ADA, 0, "made"))).toBe(false);
    expect(failed(attempt(ADA, 0, "wrong"))).toBe(true);
  });

  it("finds the next sign-in after a try, and who hasn't got in since", () => {
    const signIns = [
      { personId: ADA, at: at(30) },
      { personId: ADA, at: at(5) },
      { personId: BEN, at: at(1) },
    ];
    expect(signedInAfter(attempt(ADA, 2), signIns)).toBe(at(5));
    expect(signedInAfter(attempt(ADA, 40), signIns)).toBeNull();
    expect(signedInAfter(attempt(BEN, 2), signIns)).toBeNull();
    // Ada tried again after her last sign-in; Ben's try came after his.
    const trying = stillTrying(
      [attempt(ADA, 2), attempt(ADA, 40, "wrong"), attempt(BEN, 3)],
      signIns
    );
    expect(trying.map((entry) => [entry.personId, entry.outcome])).toEqual([
      [ADA, "wrong"],
      [BEN, "sent"],
    ]);
    expect(stillTrying([attempt(ADA, 2)], signIns)).toEqual([]);
    // A used link opened again, after signing in, isn't being stuck.
    expect(
      stillTrying([attempt(ADA, 2), { ...attempt(ADA, 41, "used"), kind: "link" }], signIns)
    ).toEqual([]);
  });

  it("says how much later", () => {
    expect(laterBy(at(0), at(0))).toBe("right away");
    expect(laterBy(at(0), at(1))).toBe("1 minute later");
    expect(laterBy(at(0), at(59))).toBe("59 minutes later");
    expect(laterBy(at(0), new Date(Date.parse(at(0)) + 3 * 3600_000).toISOString())).toBe(
      "3 hours later"
    );
    expect(laterBy(at(0), new Date(Date.parse(at(0)) + 26 * 3600_000).toISOString())).toBe(
      "a day later"
    );
  });
});
