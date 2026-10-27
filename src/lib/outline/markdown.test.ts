import { describe, expect, it } from "vitest";
import {
  attachmentIdsIn,
  commentText,
  linkedDocumentsIn,
  outlineToWiki,
  type ConvertContext,
} from "./markdown";

const ctx: ConvertContext = {
  host: "https://wiki.example",
  linkTitle: (urlId) => (urlId === "GhIjKl5678" ? "Bylaws" : null),
  mention: (userId, name) => (userId === "u-dev" ? `:person[${name}]{#000000000004}` : name),
  attachment: (id, kind, text) =>
    id === "att-1"
      ? `![${text}](/api/circles/board/wiki/images/img-1)`
      : id === "att-2" && kind === "file"
        ? "[[doc:sheet.csv]]"
        : null,
};

describe("Outline's Markdown as CVC's", () => {
  it("turns highlights, notices, underlines and mentions into CVC's own", () => {
    const { body } = outlineToWiki(
      "The Board ==keeps the books==.\n\n:::info\nMeets Tuesday.\n:::\n\n:::success\nDone.\n:::\n\nAlso __under__ and @[Dev Dogwood](mention://m1/user/u-dev) and @[Xavier](mention://m2/user/u-x).",
      ctx
    );
    expect(body).toContain(':mark[keeps the books]{color="yellow"}');
    expect(body).toContain(':::callout{kind="info"}\nMeets Tuesday.\n:::');
    expect(body).toContain(':::callout{kind="tip"}\nDone.\n:::');
    expect(body).toContain("Also under and");
    expect(body).toContain(":person[Dev Dogwood]{#000000000004}");
    expect(body).toContain("and Xavier.");
  });

  it("points links at imported pages, or at the wiki, and re-hosts attachments", () => {
    const { body } = outlineToWiki(
      "See [the bylaws](/doc/bylaws-GhIjKl5678) and [Bylaws](/doc/bylaws-GhIjKl5678) and [elsewhere](/doc/other-ZzZzZz0000) and [a collection](/collection/cvc-board-z0eYn0zG77).\n\n![the barn](/api/attachments.redirect?id=att-1)\n\nA [sheet](/api/attachments.redirect?id=att-2) and a [lost file](/api/attachments.redirect?id=att-9) and ![lost](/api/attachments.redirect?id=att-8).",
      ctx
    );
    expect(body).toContain("[[Bylaws|the bylaws]]");
    expect(body).toContain("[[Bylaws]] and");
    expect(body).toContain("[elsewhere](https://wiki.example/doc/other-ZzZzZz0000)");
    expect(body).toContain("[a collection](https://wiki.example/collection/cvc-board-z0eYn0zG77)");
    expect(body).toContain("![the barn](/api/circles/board/wiki/images/img-1)");
    expect(body).toContain(
      "A [[doc:sheet.csv]] and a lost file and *(an image kept in the wiki: lost)*."
    );
    expect(
      attachmentIdsIn(
        "x ![a](/api/attachments.redirect?id=att-1) [b](/api/attachments.redirect?id=att-2) ![c](/api/attachments.redirect?id=att-1)"
      )
    ).toEqual(["att-1", "att-2"]);
    expect(
      linkedDocumentsIn("[x](/doc/a-GhIjKl5678) [y](/doc/b-ZzZzZz0000?x=1) [z](/other)")
    ).toEqual(["GhIjKl5678", "ZzZzZz0000"]);
  });

  it("keeps Outline's text from becoming CVC directives, and leaves code alone", () => {
    const { body } = outlineToWiki(
      "[[not a link]] and ::not a directive\n:::nor this\n\n```\n==code== [[stays]] :::info\n```\n\n==after==",
      ctx
    );
    // Mid-line colons are nothing to CVC; a line starting with them would be a directive.
    expect(body).toContain("\\[\\[not a link]] and ::not a directive\n\\:::nor this");
    expect(body).toContain("```\n==code== [[stays]] :::info\n```");
    expect(body).toContain(':mark[after]{color="yellow"}');
  });

  it("cuts a page that's too long, saying so", () => {
    const { body, cut } = outlineToWiki("a".repeat(60_000), ctx);
    expect(cut).toBe(true);
    expect(body.length).toBeLessThanOrEqual(50_000);
    expect(body).toContain("didn't fit");
  });

  it("flattens a comment's ProseMirror into text", () => {
    expect(
      commentText({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Should we meet " },
              { type: "text", marks: [{ type: "strong" }], text: "monthly" },
              { type: "text", text: "?" },
            ],
          },
          {
            type: "bullet_list",
            content: [
              {
                type: "list_item",
                content: [{ type: "paragraph", content: [{ type: "text", text: "yes" }] }],
              },
              {
                type: "list_item",
                content: [{ type: "paragraph", content: [{ type: "text", text: "no" }] }],
              },
            ],
          },
        ],
      })
    ).toBe("Should we meet monthly?\n\n- yes\n- no");
    expect(commentText(null)).toBe("");
  });
});
