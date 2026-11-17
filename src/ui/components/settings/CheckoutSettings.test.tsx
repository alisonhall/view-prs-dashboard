/** @jest-environment jsdom */

import { placeholdersInSingleQuotes } from './CheckoutSettings';

describe('checkout settings', () => {
  test("finds placeholders inside the command's own single quotes - not in double quotes, outside quotes, or escaped", () => {
    expect(placeholdersInSingleQuotes("echo '{branch}' {number}")).toEqual(['{branch}']);
    expect(placeholdersInSingleQuotes("a '{branch} and {repo}' '{branch}'")).toEqual(['{branch}', '{repo}']);
    expect(placeholdersInSingleQuotes('echo "{branch}" {number}')).toEqual([]);
    expect(placeholdersInSingleQuotes('echo "it\'s" {branch}')).toEqual([]);
    expect(placeholdersInSingleQuotes("echo \\'{branch}")).toEqual([]);
    expect(placeholdersInSingleQuotes("echo '{nope}' '{ref}'")).toEqual(['{ref}']);
  });
});
