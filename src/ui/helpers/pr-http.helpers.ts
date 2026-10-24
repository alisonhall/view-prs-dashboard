// POSTs a JSON body and returns both the response and its parsed JSON.
// The result type is the caller's to assert; the server's responses are
// not typed yet.
export interface PostJsonResult<T> {
  response: Response;
  result: T;
}

export interface PrHttpDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const createPrHttpHelpers = ({ fetch }: PrHttpDeps) => {
  const postJson = async <T = unknown>(url: string, payload: unknown): Promise<PostJsonResult<T>> => {
    const response = await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    const result: T = await response.json();
    return { response, result };
  };

  return {
    postJson,
  };
};

export { createPrHttpHelpers };

// A separate module-scope copy for components, calling the global fetch
// directly. It is deliberately not the factory's postJson: the factory's
// injected `fetch` is what pr-http.helpers.test.js mocks to check the
// exact call arguments and error propagation.
export const postJson = async <T = unknown>(url: string, payload: unknown): Promise<PostJsonResult<T>> => {
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
  const result: T = await response.json();
  return { response, result };
};
