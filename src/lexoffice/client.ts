export const LEXWARE_BASE_URL = "https://api.lexware.io/v1";

export class LexwareApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "LexwareApiError";
  }
}

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Minimum spacing between requests. Lexware allows 2 req/s. */
  minIntervalMs?: number;
  maxRetries?: number;
}

export type QueryValue = string | number | boolean | undefined | null;

export interface Page<T> {
  content: T[];
  last: boolean;
  totalPages: number;
  number: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class LexwareClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private nextSlot = 0;

  constructor(opts: ClientOptions) {
    if (!opts.apiKey) {
      throw new Error("Lexware API key is missing. Set LEXOFFICE_API_KEY.");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? LEXWARE_BASE_URL;
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.now = opts.now ?? (() => Date.now());
    this.minIntervalMs = opts.minIntervalMs ?? 500;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  get<T = unknown>(path: string, query: Record<string, QueryValue> = {}): Promise<T> {
    return this.request<T>(path, query);
  }

  /** Collects every page of a paged endpoint, up to maxPages. */
  async getAllPages<T>(
    path: string,
    query: Record<string, QueryValue> = {},
    opts: { maxPages?: number } = {},
  ): Promise<T[]> {
    const maxPages = opts.maxPages ?? 100;
    const out: T[] = [];
    for (let page = 0; page < maxPages; page++) {
      const res = await this.get<Page<T>>(path, { ...query, page, size: query.size ?? 100 });
      out.push(...res.content);
      if (res.last || res.totalPages <= page + 1) break;
    }
    return out;
  }

  private async throttle(): Promise<void> {
    const now = this.now();
    const wait = Math.max(0, this.nextSlot - now);
    this.nextSlot = Math.max(now, this.nextSlot) + this.minIntervalMs;
    if (wait > 0) await this.sleep(wait);
  }

  private buildUrl(path: string, query: Record<string, QueryValue>): string {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  private async request<T>(path: string, query: Record<string, QueryValue>): Promise<T> {
    const url = this.buildUrl(path, query);
    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
      });

      if (res.status === 429 && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * 2 ** attempt;
        await this.sleep(backoff);
        continue;
      }

      if (!res.ok) {
        throw new LexwareApiError(
          `Lexware API error ${res.status} on ${path}`,
          res.status,
          path,
        );
      }
      return (await res.json()) as T;
    }
  }
}
