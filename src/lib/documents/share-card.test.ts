import { describe, expect, it } from "vitest";
import { shareCardHtml } from "./share-card";

describe("shareCardHtml", () => {
  it("lays out the circle's icon, the title as a link, and the circle and kind beneath", () => {
    const html = shareCardHtml({
      url: "https://example.org/wiki/pond-rules",
      title: "Pond rules",
      circle: {
        name: "Land Care Circle",
        iconUrl: "https://example.org/icon?v=1&s=x",
        initials: "LCC",
      },
      label: "Page",
    });
    expect(html).toContain(
      '<img src="https://example.org/icon?v=1&amp;s=x" width="40" height="40"'
    );
    expect(html.match(/href="https:\/\/example.org\/wiki\/pond-rules"/g)).toHaveLength(2);
    expect(html).toContain(">Pond rules</a>");
    expect(html).toContain("Land Care Circle · Page");
    expect(html).toMatch(/^<table role="presentation"/);
  });

  it("shows the circle's initials when it has no icon, and escapes everything", () => {
    const html = shareCardHtml({
      url: "https://example.org/documents/1?a=1&b=2",
      title: 'Fees <2027> & "dues"',
      circle: { name: "O&M", initials: "O&M" },
    });
    expect(html).not.toContain("<img");
    expect(html).toContain(">O&amp;M</div>");
    expect(html).toContain("Fees &lt;2027&gt; &amp; &quot;dues&quot;");
    expect(html).toContain('href="https://example.org/documents/1?a=1&amp;b=2"');
  });

  it("without a circle: just the title and what it is", () => {
    const html = shareCardHtml({
      url: "https://example.org/proposals/9",
      title: "Mow less",
      label: "Proposal",
    });
    expect(html).not.toContain("width:40px");
    expect(html).toContain(">Proposal</span>");
  });
});
