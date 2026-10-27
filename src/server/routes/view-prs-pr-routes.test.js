const { buildSavedNoteComments } = require("./view-prs-pr-routes");

const NOW = "2026-10-27T12:00:00Z";
const stored = {
  id: "comment-1",
  author: "alice",
  tone: "Positive",
  note: "Looks good",
  createdAt: "2026-01-02T03:04:05Z",
  updatedAt: "2026-01-03T03:04:05Z",
};

describe("buildSavedNoteComments", () => {
  test("an unchanged comment sent without timestamps keeps its stored ones", () => {
    const [comment] = buildSavedNoteComments(
      [{ id: "comment-1", author: "alice", tone: "Positive", note: "Looks good" }],
      [stored],
      NOW,
    );
    expect(comment).toEqual(stored);
  });

  test("an edited comment keeps createdAt and gets now as updatedAt", () => {
    for (const edit of [{ note: "Changed" }, { tone: "Negative" }, { author: "bob" }]) {
      const [comment] = buildSavedNoteComments(
        [{ id: "comment-1", author: "alice", tone: "Positive", note: "Looks good", ...edit }],
        [stored],
        NOW,
      );
      expect(comment).toMatchObject({ ...edit, createdAt: stored.createdAt, updatedAt: NOW });
    }
  });

  test("a new comment gets now for both", () => {
    const [comment] = buildSavedNoteComments([{ id: "comment-9", author: "bob", note: "New" }], [stored], NOW);
    expect(comment).toEqual({ id: "comment-9", author: "bob", tone: "Neutral", note: "New", createdAt: NOW, updatedAt: NOW });
  });

  test("timestamps a client does send win", () => {
    const [comment] = buildSavedNoteComments(
      [{ ...stored, note: "Changed", createdAt: "2025-05-05T00:00:00Z", updatedAt: "2025-06-06T00:00:00Z" }],
      [stored],
      NOW,
    );
    expect(comment).toMatchObject({ createdAt: "2025-05-05T00:00:00Z", updatedAt: "2025-06-06T00:00:00Z" });
  });

  test("a comment without an id gets one; non-objects are dropped; no stored notes is fine", () => {
    const comments = buildSavedNoteComments([null, "x", { author: "a", note: "n" }], undefined, NOW);
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toMatch(/^c-\d+-/);
    expect(comments[0]).toMatchObject({ createdAt: NOW, updatedAt: NOW });
  });
});
