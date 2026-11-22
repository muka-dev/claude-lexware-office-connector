import { describe, it, expect } from "vitest";
import { missingTaxRows, type InvoiceDetail } from "../src/analytics/index.js";

const inv = (over: Partial<InvoiceDetail> & { id: string }): InvoiceDetail => ({
  voucherStatus: "open",
  voucherNumber: over.id.toUpperCase(),
  taxAmounts: [{ taxRatePercentage: 0, taxAmount: 0, netAmount: 100 }],
  totalPrice: { totalNetAmount: 100, totalGrossAmount: 100, totalTaxAmount: 0 },
  ...over,
});

describe("missingTaxRows", () => {
  it("reports invoices without tax rows with their net sum and numbers", () => {
    const invoices = [
      inv({ id: "a" }),
      inv({ id: "b", taxAmounts: [], totalPrice: { totalNetAmount: 790, totalGrossAmount: 790, totalTaxAmount: 0 } }),
      inv({ id: "c", taxAmounts: [], totalPrice: { totalNetAmount: 200, totalGrossAmount: 200, totalTaxAmount: 0 } }),
      inv({ id: "d", taxAmounts: [], totalPrice: { totalNetAmount: 300, totalGrossAmount: 300, totalTaxAmount: 0 } }),
      inv({ id: "e", taxAmounts: [], totalPrice: { totalNetAmount: 10, totalGrossAmount: 10, totalTaxAmount: 0 } }),
    ];
    expect(missingTaxRows(invoices, 4)).toEqual({ count: 4, net: 1300, voucherNumbers: ["B", "C", "D", "E"] });
  });

  it("ignores drafts and voided invoices", () => {
    const invoices = [
      inv({ id: "a", voucherStatus: "draft", taxAmounts: [] }),
      inv({ id: "b", voucherStatus: "voided", taxAmounts: [] }),
    ];
    expect(missingTaxRows(invoices, 5)).toEqual({ count: 0, net: 0, voucherNumbers: [] });
  });

  it("shows only the count below the minimum group size", () => {
    const invoices = [inv({ id: "a", taxAmounts: [], totalPrice: { totalNetAmount: 790, totalGrossAmount: 790, totalTaxAmount: 0 } })];
    expect(missingTaxRows(invoices, 5)).toEqual({ count: 1, net: null, voucherNumbers: null, suppressed: true });
  });

  it("falls back to zero when the detail has no totals", () => {
    const invoices = [inv({ id: "a", taxAmounts: [], totalPrice: undefined })];
    expect(missingTaxRows(invoices, 1)).toEqual({ count: 1, net: 0, voucherNumbers: ["A"] });
  });
});
