import { describe, expect, it } from "vitest";
import { linkIn, readable } from "../e2e/outbox.js";

// The e2e helper that reads the game server's emails from the outbox.
const mail = [
  "From: game@example.org",
  "To: ann@example.org",
  "List-Unsubscribe:",
  " <https://game.example.org/api/email/unsubscribe?u=u_1&t=9FABcd12>",
  "Content-Type: text/plain; charset=utf-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Your turn in Greenvale =E2=80=94 caf=C3=A9 edition.",
  "Play: https://game.example.org/play?match=3Dm_1&long=3D=",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=",
  "bbb",
  " indented line stays its own line",
].join("\r\n");

describe("readable", () => {
  it("unfolds headers but leaves their = signs alone", () => {
    const text = readable(mail);
    expect(text).toContain("List-Unsubscribe: <https://game.example.org/api/email/unsubscribe?u=u_1&t=9FABcd12>");
    expect(linkIn(text, "/api/email/unsubscribe")).toBe("https://game.example.org/api/email/unsubscribe?u=u_1&t=9FABcd12");
  });

  it("decodes a quoted-printable body as UTF-8, joining soft line breaks", () => {
    const text = readable(mail);
    expect(text).toContain("Your turn in Greenvale — café edition.");
    expect(text).toContain(`Play: https://game.example.org/play?match=m_1&long=${"a".repeat(71)}bbb`);
    expect(text).toContain("\r\n indented line stays its own line");
  });

  it("leaves a body that is not quoted-printable as it is", () => {
    const plain = "To: ann@example.org\r\n\r\nLink: https://x.example.org/a?t=9fAB";
    expect(readable(plain)).toBe(plain);
  });
});
