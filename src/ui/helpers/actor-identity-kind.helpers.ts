// What a person's identity is: a GitHub login, or a commit author's name or
// email - what GitHub gives for a commit whose author isn't linked to an
// account (a commit made with an email GitHub doesn't know), which the
// script records as its actor. A GitHub login has no space, comma or @, so
// anything with one is a commit author. The server's isCommitAuthorIdentity
// (view-prs-actors-storage.js) is the same rule.
export const isCommitAuthorIdentity = (value: unknown): boolean => /[\s,@]/.test(String(value ?? '').trim());
