import { describe, it, expect } from "vitest";
import { revenueByMonth, agingReport, vatSummary, customerConcentration, type VoucherListItem } from "../src/analytics/index.js";

const v = (id: string, contactId: string, over: Partial<VoucherListItem> = {}): VoucherListItem => ({
  id,
  voucherType: "invoice",
  voucherStatus: "open",
  voucherNumber: id,
  voucherDate: "2026-02-10T00:00:00.000+01:00",
  dueDate: "2026-02-20T00:00:00.000+01:00",
  contactId,
  contactName: `Name ${contactId}`,
  totalAmount: 100,
  openAmount: 100,
  currency: "EUR",
  archived: false,
  ...over,
});

describe("minimum group size (k) in revenueByMonth", () => {
  it("suppresses a month with fewer distinct customers than k", () => {
    const items = [v("1", "a"), v("2", "b"), v("3", "a")];
    const r = revenueByMonth(items, 5);
    expect(r).toEqual([{ month: "2026-02", gross: null, count: null, suppressed: true }]);
  });

  it("shows a month once it has at least k distinct customers", () => {
    const items = ["a", "b", "c", "d", "e"].map((c, i) => v(String(i), c));
    const r = revenueByMonth(items, 5);
    expect(r[0]).toMatchObject({ month: "2026-02", gross: 500, count: 5 });
    expect(r[0].suppressed).toBeUndefined();
  });
});

describe("minimum group size (k) in agingReport", () => {
  const today = new Date("2026-03-31T12:00:00+02:00");

  it("hides a bucket with fewer than k distinct customers", () => {
    const items = [v("1", "a", { dueDate: "2026-03-01T00:00:00.000+01:00" }), v("2", "b", { dueDate: "2026-03-01T00:00:00.000+01:00" })];
    const r = agingReport(items, today, 5);
    expect(r.buckets["1-30"]).toEqual({ total: null, count: null, suppressed: true });
    expect(r.grandTotal).toBeNull();
  });
});

describe("minimum group size (k) in vatSummary", () => {
  it("hides a tax rate that is based on fewer than k invoices", () => {
    const invoices = [{ id: "1", voucherStatus: "open", taxAmounts: [{ taxRatePercentage: 19, taxAmount: 19, netAmount: 100 }] }];
    expect(vatSummary(invoices, 5)).toEqual([{ taxRatePercentage: 19, net: null, tax: null, suppressed: true }]);
  });
});

describe("customerConcentration", () => {
  it("returns share bands for the largest customers and no names", () => {
    const items = [
      v("1", "a", { totalAmount: 400, contactName: "Alpha GmbH" }),
      v("2", "b", { totalAmount: 200, contactName: "Beta GmbH" }),
      v("3", "c", { totalAmount: 100 }), v("4", "d", { totalAmount: 100 }), v("5", "e", { totalAmount: 100 }), v("6", "f", { totalAmount: 100 }),
    ];
    const r = customerConcentration(items, 5);
    expect(r.customerCount).toBe(6);
    expect(r.topShares).toEqual([
      { rank: 1, shareBand: "40–50 %" }, // 400 of 1000 is exactly 40 %
      { rank: 2, shareBand: "20–30 %" },
      { rank: 3, shareBand: "10–20 %" },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/Alpha|Beta/);
  });

  it("suppresses everything when there are fewer than k customers", () => {
    const r = customerConcentration([v("1", "a"), v("2", "b")], 5);
    expect(r).toEqual({ suppressed: true, customerCount: null, topShares: [] });
  });
});

describe("parseMinGroup", () => {
  it("defaults to 5 and accepts integers from 1 upwards", async () => {
    const { parseMinGroup } = await import("../src/analytics/index.js");
    expect(parseMinGroup(undefined)).toBe(5);
    expect(parseMinGroup("")).toBe(5);
    expect(parseMinGroup("3")).toBe(3);
    expect(parseMinGroup("1")).toBe(1);
  });

  it("falls back to 5 for invalid or unsafe values", async () => {
    const { parseMinGroup } = await import("../src/analytics/index.js");
    expect(parseMinGroup("0")).toBe(5);
    expect(parseMinGroup("-2")).toBe(5);
    expect(parseMinGroup("abc")).toBe(5);
    expect(parseMinGroup("2.5")).toBe(5);
  });
});
