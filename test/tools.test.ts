import { describe, it, expect, vi } from "vitest";
import { buildTools } from "../src/tools.js";

function fakeClient(overrides: Partial<Record<string, unknown>> = {}) {
  const get = vi.fn(async (path: string, _q?: Record<string, unknown>) => {
    if (path === "/profile") return { companyName: "Testfirma GmbH", taxType: "net", smallBusiness: false };
    if (path.startsWith("/invoices/")) {
      return {
        id: path.split("/")[2],
        voucherStatus: "open",
        taxAmounts: [{ taxRatePercentage: 19, taxAmount: 19, netAmount: 100 }],
      };
    }
    return {};
  });
  const getAllPages = vi.fn(async (_path: string, _q?: Record<string, unknown>) => [] as unknown[]);
  return { get, getAllPages, ...overrides } as any;
}

// minGroupSize 1 keeps these fixtures (single invoices) visible; threshold tests below use the default.
const ctx = (client: any) => ({
  client,
  today: () => new Date("2026-03-31T12:00:00+02:00"),
  maxInvoiceDetails: 50,
  minGroupSize: 1,
});

describe("buildTools", () => {
  it("exposes only read-only tool names prefixed with lexware_", () => {
    const tools = buildTools(ctx(fakeClient()));
    const names = tools.map((t) => t.name);
    for (const n of names) {
      expect(n.startsWith("lexware_")).toBe(true);
      expect(n).not.toMatch(/create|update|delete|finalize|pursue|upload/);
    }
    expect(names).toEqual(
      expect.arrayContaining([
        "lexware_profile",
        "lexware_search_contacts",
        "lexware_get_contact",
        "lexware_list_vouchers",
        "lexware_get_invoice",
        "lexware_search_articles",
        "lexware_aging_report",
        "lexware_revenue_by_month",
        "lexware_customer_concentration",
        "lexware_vat_summary",
      ]),
    );
  });

  it("lexware_list_vouchers queries voucherlist with mandatory type and status", async () => {
    const client = fakeClient();
    const tool = buildTools(ctx(client)).find((t) => t.name === "lexware_list_vouchers")!;

    await tool.handler({ voucherStatus: "open", from: "2026-01-01", to: "2026-03-31" });

    const [path, query] = client.getAllPages.mock.calls[0];
    expect(path).toBe("/voucherlist");
    expect(query.voucherStatus).toBe("open");
    expect(query.voucherDateFrom).toBe("2026-01-01");
    expect(query.voucherDateTo).toBe("2026-03-31");
    // default type set contains only sales-side types
    expect(query.voucherType).toContain("invoice");
    expect(query.voucherType).not.toMatch(/purchase|salesinvoice|salescreditnote/);
  });

  it("does not offer purchase or bookkeeping voucher types in the input schema", () => {
    const tool = buildTools(ctx(fakeClient())).find((t) => t.name === "lexware_list_vouchers")!;
    const schema = JSON.stringify(tool.inputSchema);
    expect(schema).not.toMatch(/purchaseinvoice|purchasecreditnote|salesinvoice|salescreditnote/);
  });

  it("lexware_profile returns the profile from the API", async () => {
    const tools = buildTools(ctx(fakeClient()));
    const tool = tools.find((t) => t.name === "lexware_profile")!;
    const res = await tool.handler({});
    expect(res).toMatchObject({ companyName: "Testfirma GmbH", taxType: "net" });
  });

  it("lexware_vat_summary fetches invoice details and caches them", async () => {
    const client = fakeClient();
    client.getAllPages.mockResolvedValue([
      { id: "inv-1", voucherType: "invoice", voucherStatus: "open", voucherDate: "2026-02-01T00:00:00.000+01:00", totalAmount: 119, contactId: "c", contactName: "A", openAmount: 119, currency: "EUR", voucherNumber: "1", archived: false, dueDate: null, createdDate: "", updatedDate: "" },
    ]);
    const tool = buildTools(ctx(client)).find((t) => t.name === "lexware_vat_summary")!;

    const first = await tool.handler({ from: "2026-01-01", to: "2026-03-31" });
    const second = await tool.handler({ from: "2026-01-01", to: "2026-03-31" });

    expect(first).toEqual([{ taxRatePercentage: 19, net: 100, tax: 19 }]);
    expect(second).toEqual(first);
    const invoiceCalls = client.get.mock.calls.filter(([p]: [string]) => p.startsWith("/invoices/"));
    expect(invoiceCalls.length).toBe(1); // second run served from cache
  });

  it("returns a tool error instead of throwing when the API fails", async () => {
    const client = fakeClient();
    client.getAllPages.mockRejectedValueOnce(Object.assign(new Error("Lexware API error 401"), { status: 401 }));
    const tool = buildTools(ctx(client)).find((t) => t.name === "lexware_aging_report")!;

    const res = await tool.handler({ from: "2026-01-01", to: "2026-03-31" });

    expect(res).toMatchObject({ isError: true });
    expect(JSON.stringify(res)).not.toContain("test-key");
  });
});

describe("buildTools with redaction", () => {
  it("applies ctx.redact to successful tool results", async () => {
    const client = fakeClient();
    client.getAllPages.mockResolvedValue([
      { id: "1", voucherType: "invoice", voucherStatus: "open", voucherDate: "2026-02-01T00:00:00.000+01:00", totalAmount: 119, contactId: "c", contactName: "Musterfrau, Erika", openAmount: 119, currency: "EUR", voucherNumber: "RE1", archived: false, dueDate: null },
    ]);
    const { Redactor } = await import("../src/redact/index.js");
    const tools = buildTools({ ...ctx(client), redact: (v) => new Redactor().redact(v) });
    const list = tools.find((t) => t.name === "lexware_list_vouchers")!;

    const res = (await list.handler({ from: "2026-01-01", to: "2026-03-31" })) as any[];

    expect(res[0].contactName).toMatch(/^Kontakt \d+$/);
    expect(res[0].totalAmount).toBe(119);
  });

  it("leaves results unchanged when no redactor is configured", async () => {
    const client = fakeClient();
    client.getAllPages.mockResolvedValue([
      { id: "1", voucherType: "invoice", voucherStatus: "open", voucherDate: "2026-02-01T00:00:00.000+01:00", totalAmount: 119, contactId: "c", contactName: "Musterfrau, Erika", openAmount: 119, currency: "EUR", voucherNumber: "RE1", archived: false, dueDate: null },
    ]);
    const tools = buildTools(ctx(client));
    const list = tools.find((t) => t.name === "lexware_list_vouchers")!;

    const res = (await list.handler({ from: "2026-01-01", to: "2026-03-31" })) as any[];

    expect(res[0].contactName).toBe("Musterfrau, Erika");
  });

  it("does not redact error results", async () => {
    const client = fakeClient();
    client.getAllPages.mockRejectedValueOnce(new Error("Lexware API error 401"));
    const tools = buildTools({ ...ctx(client), redact: (v) => v });
    const res = await tools.find((t) => t.name === "lexware_aging_report")!.handler({});
    expect(res).toMatchObject({ isError: true });
  });
});

describe("minimum group size defaults", () => {
  it("suppresses VAT rates based on fewer than 5 invoices when no threshold is configured", async () => {
    const client = fakeClient();
    client.getAllPages.mockResolvedValue([
      { id: "inv-1", voucherType: "invoice", voucherStatus: "open", voucherDate: "2026-02-01T00:00:00.000+01:00", totalAmount: 119, contactId: "c", contactName: "A", openAmount: 119, currency: "EUR", voucherNumber: "1", archived: false, dueDate: null },
    ]);
    const { minGroupSize: _omit, ...withoutThreshold } = ctx(client);
    const tools = buildTools(withoutThreshold as any);
    const res = (await tools.find((t) => t.name === "lexware_vat_summary")!.handler({ from: "2026-01-01", to: "2026-03-31" })) as any[];
    expect(res[0]).toMatchObject({ taxRatePercentage: 19, net: null, tax: null, suppressed: true });
  });

  it("customer concentration returns no names", async () => {
    const client = fakeClient();
    client.getAllPages.mockResolvedValue(
      ["a", "b", "c", "d", "e", "f"].map((c, i) => ({ id: String(i), voucherType: "invoice", voucherStatus: "open", voucherDate: "2026-02-01T00:00:00.000+01:00", totalAmount: 100, contactId: c, contactName: `Firma ${c}`, openAmount: 100, currency: "EUR", voucherNumber: String(i), archived: false, dueDate: null })),
    );
    const { minGroupSize: _omit, ...withoutThreshold } = ctx(client);
    const tools = buildTools(withoutThreshold as any);
    const res = (await tools.find((t) => t.name === "lexware_customer_concentration")!.handler({ from: "2026-01-01", to: "2026-03-31" })) as any;
    expect(res.customerCount).toBe(6);
    expect(JSON.stringify(res)).not.toMatch(/Firma/);
  });
});
