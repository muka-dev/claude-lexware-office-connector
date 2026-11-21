import { describe, it, expect, vi } from "vitest";
import { LexwareClient, LexwareApiError } from "../src/lexoffice/client.js";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function makeClient(fetchImpl: typeof fetch, now = { t: 0 }) {
  const sleeps: number[] = [];
  const client = new LexwareClient({
    apiKey: "test-key",
    fetch: fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
      now.t += ms;
    },
    now: () => now.t,
    minIntervalMs: 500, // 2 requests per second
    maxRetries: 3,
  });
  return { client, sleeps, now };
}

describe("LexwareClient", () => {
  it("requires an API key", () => {
    expect(() => new LexwareClient({ apiKey: "" })).toThrow(/API key/i);
  });

  it("sends Bearer auth and JSON accept header to the v1 base URL", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ companyName: "Testfirma GmbH" }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    const profile = await client.get<{ companyName: string }>("/profile");

    expect(profile.companyName).toBe("Testfirma GmbH");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.lexware.io/v1/profile");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect((init.headers as Record<string, string>).Accept).toBe("application/json");
    expect(init.method).toBe("GET");
  });

  it("serializes query parameters and drops undefined values", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ content: [] }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    await client.get("/voucherlist", {
      voucherType: "invoice,creditnote",
      voucherStatus: "open",
      contactId: undefined,
      page: 0,
    });

    const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("voucherType")).toBe("invoice,creditnote");
    expect(parsed.searchParams.get("voucherStatus")).toBe("open");
    expect(parsed.searchParams.get("page")).toBe("0");
    expect(parsed.searchParams.has("contactId")).toBe(false);
  });

  it("spaces consecutive requests at least minIntervalMs apart (token bucket)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    const { client, sleeps } = makeClient(fetchMock as unknown as typeof fetch);

    await client.get("/profile");
    await client.get("/profile");
    await client.get("/profile");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // first call is free, the next two each wait ~500ms
    expect(sleeps.filter((ms) => ms >= 500).length).toBe(2);
  });

  it("retries on HTTP 429 with backoff and succeeds", async () => {
    const responses = [
      new Response("", { status: 429, headers: { "retry-after": "1" } }),
      new Response("", { status: 429 }),
      jsonResponse({ ok: true }),
    ];
    const fetchMock = vi.fn(async () => responses.shift() as Response);
    const { client, sleeps } = makeClient(fetchMock as unknown as typeof fetch);

    const result = await client.get<{ ok: boolean }>("/profile");

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Retry-After: 1 => 1000ms, second retry backs off further (>= first)
    expect(sleeps).toContain(1000);
    const backoffs = sleeps.filter((ms) => ms >= 1000);
    expect(backoffs.length).toBe(2);
    expect(backoffs[1]).toBeGreaterThan(backoffs[0]);
  });

  it("gives up after maxRetries on repeated 429 and throws LexwareApiError", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 429 }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    await expect(client.get("/profile")).rejects.toBeInstanceOf(LexwareApiError);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 + 3 retries
  });

  it("maps 401 to a LexwareApiError without retrying and without leaking the key", async () => {
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    const err = (await client.get("/profile").catch((e) => e)) as LexwareApiError;

    expect(err).toBeInstanceOf(LexwareApiError);
    expect(err.status).toBe(401);
    expect(err.message).not.toContain("test-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("paginates through all pages with getAllPages", async () => {
    const pages = [
      { content: [{ id: "a" }], last: false, totalPages: 2, number: 0 },
      { content: [{ id: "b" }], last: true, totalPages: 2, number: 1 },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return jsonResponse(pages[page]);
    });
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    const all = await client.getAllPages<{ id: string }>("/contacts", {}, { maxPages: 10 });

    expect(all.map((c) => c.id)).toEqual(["a", "b"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops paging at maxPages to protect the rate limit", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ content: [{ id: "x" }], last: false, totalPages: 99, number: 0 }),
    );
    const { client } = makeClient(fetchMock as unknown as typeof fetch);

    const all = await client.getAllPages("/contacts", {}, { maxPages: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(all.length).toBe(2);
  });
});
