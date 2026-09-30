const { createPrHttpHelpers } = require("./pr-http.helpers.js");

describe("pr-http helpers", () => {
  test("given a url and payload, when postJson is called, then it POSTs JSON with the expected headers and returns the parsed response", async () => {
    const jsonBody = { ok: true };
    const response = { json: jest.fn().mockResolvedValue(jsonBody) };
    const fetch = jest.fn().mockResolvedValue(response);
    const { postJson } = createPrHttpHelpers({ fetch });

    const payload = { prNumber: "1", repo: "owner/repo" };
    const outcome = await postJson("/view-prs/ack", payload);

    expect(fetch).toHaveBeenCalledWith("/view-prs/ack", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    expect(outcome).toEqual({ response, result: jsonBody });
  });

  test("given fetch rejects, when postJson is called, then the rejection propagates instead of being swallowed", async () => {
    const fetchError = new Error("network down");
    const fetch = jest.fn().mockRejectedValue(fetchError);
    const { postJson } = createPrHttpHelpers({ fetch });

    await expect(postJson("/view-prs/ack", {})).rejects.toThrow("network down");
  });
});
