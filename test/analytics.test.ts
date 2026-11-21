import { describe, it, expect } from "vitest";
import {
  agingReport,
  revenueByMonth,
  topCustomers,
  vatSummary,
  isSalesVoucherType,
  type VoucherListItem,
  type InvoiceDetail,
} from "../src/analytics/index.js";

const v = (over: Partial<VoucherListItem>): VoucherListItem => ({
  id: over.id ?? "id",
  voucherType: "invoice",
  voucherStatus: "open",
  voucherNumber: "RE1",
  voucherDate: "2026-01-15T00:00:00.000+01:00",
  dueDate: "2026-02-14T00:00:00.000+01:00",
  contactId: "c1",
  contactName: "Test GmbH",
  totalAmount: 100,
  openAmount: 100,
  currency: "EUR",
  archived: false,
  ...over,
});

describe("isSalesVoucherType", () => {
  it("accepts sales-side types and rejects purchase and bookkeeping types", () => {
    expect(isSalesVoucherType("invoice")).toBe(true);
    expect(isSalesVoucherType("creditnote")).toBe(true);
    expect(isSalesVoucherType("purchaseinvoice")).toBe(false);
    expect(isSalesVoucherType("purchasecreditnote")).toBe(false);
    expect(isSalesVoucherType("salesinvoice")).toBe(false);
    expect(isSalesVoucherType("salescreditnote")).toBe(false);
  });
});

describe("agingReport", () => {
  const today = new Date("2026-03-31T12:00:00+02:00");

  it("buckets open receivables by days past due", () => {
    const items = [
      v({ id: "a", dueDate: "2026-04-10T00:00:00.000+02:00", openAmount: 10 }), // not due
      v({ id: "b", dueDate: "2026-03-20T00:00:00.000+01:00", openAmount: 20 }), // 11 days overdue
      v({ id: "c", dueDate: "2026-02-10T00:00:00.000+01:00", openAmount: 30 }), // 49 days
      v({ id: "d", dueDate: "2026-01-01T00:00:00.000+01:00", openAmount: 40 }), // 89 days
      v({ id: "e", dueDate: "2025-10-01T00:00:00.000+02:00", openAmount: 50 }), // >90
    ];
    const r = agingReport(items, today);
    expect(r.buckets.notDue.total).toBe(10);
    expect(r.buckets["1-30"].total).toBe(20);
    expect(r.buckets["31-60"].total).toBe(30);
    expect(r.buckets["61-90"].total).toBe(40);
    expect(r.buckets["over90"].total).toBe(50);
    expect(r.grandTotal).toBe(150);
  });

  it("ignores paid, draft, voided and zero-open items and non-sales types", () => {
    const items = [
      v({ id: "paid", voucherStatus: "paid", openAmount: 0 }),
      v({ id: "draft", voucherStatus: "draft", openAmount: 99 }),
      v({ id: "voided", voucherStatus: "voided", openAmount: 99 }),
      v({ id: "purchase", voucherType: "purchaseinvoice", openAmount: 99 }),
      v({ id: "ok", openAmount: 5 }),
    ];
    const r = agingReport(items, today);
    expect(r.grandTotal).toBe(5);
    expect(r.count).toBe(1);
  });

  it("treats a missing due date as not due", () => {
    const r = agingReport([v({ dueDate: undefined, openAmount: 7 })], today);
    expect(r.buckets.notDue.total).toBe(7);
  });
});

describe("revenueByMonth", () => {
  it("sums gross totals per YYYY-MM and nets out credit notes", () => {
    const items = [
      v({ id: "1", voucherDate: "2026-01-05T00:00:00.000+01:00", totalAmount: 119 }),
      v({ id: "2", voucherDate: "2026-01-20T00:00:00.000+01:00", totalAmount: 50 }),
      v({ id: "3", voucherType: "creditnote", voucherDate: "2026-01-25T00:00:00.000+01:00", totalAmount: 20 }),
      v({ id: "4", voucherDate: "2026-02-01T00:00:00.000+01:00", totalAmount: 200 }),
      v({ id: "5", voucherStatus: "draft", voucherDate: "2026-02-02T00:00:00.000+01:00", totalAmount: 999 }),
      v({ id: "6", voucherType: "quotation", voucherDate: "2026-02-03T00:00:00.000+01:00", totalAmount: 888 }),
    ];
    const r = revenueByMonth(items);
    expect(r).toEqual([
      { month: "2026-01", gross: 149, count: 3 },
      { month: "2026-02", gross: 200, count: 1 },
    ]);
  });
});

describe("topCustomers", () => {
  it("ranks contacts by gross revenue with share of total", () => {
    const items = [
      v({ id: "1", contactId: "a", contactName: "Alpha", totalAmount: 300 }),
      v({ id: "2", contactId: "b", contactName: "Beta", totalAmount: 100 }),
      v({ id: "3", contactId: "a", contactName: "Alpha", totalAmount: 100 }),
      v({ id: "4", contactId: null, contactName: "Sammelkontakt", totalAmount: 100 }),
    ];
    const r = topCustomers(items, 2);
    expect(r.map((x) => x.contactName)).toEqual(["Alpha", "Beta"]);
    expect(r[0].gross).toBe(400);
    expect(r[0].sharePercent).toBeCloseTo(66.667, 2); // 400 of 600
    expect(r[0].count).toBe(2);
  });
});

describe("vatSummary", () => {
  it("aggregates net and tax amounts per tax rate across invoice details", () => {
    const invoices: InvoiceDetail[] = [
      {
        id: "1",
        voucherStatus: "open",
        taxAmounts: [
          { taxRatePercentage: 19, taxAmount: 2.55, netAmount: 13.4 },
          { taxRatePercentage: 7, taxAmount: 0.58, netAmount: 8.32 },
        ],
      },
      {
        id: "2",
        voucherStatus: "paid",
        taxAmounts: [{ taxRatePercentage: 19, taxAmount: 19, netAmount: 100 }],
      },
      { id: "3", voucherStatus: "draft", taxAmounts: [{ taxRatePercentage: 19, taxAmount: 1, netAmount: 5 }] },
    ];
    const r = vatSummary(invoices);
    expect(r).toEqual([
      { taxRatePercentage: 7, net: 8.32, tax: 0.58 },
      { taxRatePercentage: 19, net: 113.4, tax: 21.55 },
    ]);
  });
});
