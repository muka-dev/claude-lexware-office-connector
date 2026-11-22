#!/usr/bin/env node
// Read-only live check against the real Lexware API. Needs a built dist/ and LEXOFFICE_API_KEY.
// Prints only aggregates and field names, never names, addresses or e-mail addresses.
// Usage: npm run build && node scripts/live-check.mjs [from yyyy-MM-dd] [to yyyy-MM-dd]
import { LexwareClient } from "../dist/lexoffice/client.js";
import { agingReport, revenueByMonth, customerConcentration, vatSummary, missingTaxRows, SALES_VOUCHER_TYPES, parseMinGroup } from "../dist/analytics/index.js";

const apiKey = process.env.LEXOFFICE_API_KEY;
if (!apiKey) {
  console.error("LEXOFFICE_API_KEY is not set. Nothing was sent.");
  process.exit(1);
}

const now = new Date();
const from = process.argv[2] ?? `${now.getFullYear()}-01-01`;
const to = process.argv[3] ?? now.toISOString().slice(0, 10);
const minGroup = parseMinGroup(process.env.LEXWARE_MIN_GROUP);
const client = new LexwareClient({ apiKey });

const keysOf = (o) => (o && typeof o === "object" ? Object.keys(o).sort() : []);

async function main() {
  // 1. profile: only the non-personal fields
  const profile = await client.get("/profile");
  console.log("== profile (fields)", keysOf(profile).join(", "));
  console.log("taxType:", profile.taxType, "| smallBusiness:", profile.smallBusiness, "| businessFeatures:", (profile.businessFeatures ?? []).join(", "));

  // 2. vouchers in the period, same filter as the tools
  const vouchers = await client.getAllPages("/voucherlist", {
    voucherType: SALES_VOUCHER_TYPES.join(","),
    voucherStatus: "any",
    voucherDateFrom: from,
    voucherDateTo: to,
    size: 250,
  });
  console.log(`\n== vouchers ${from} to ${to}: ${vouchers.length}`);
  console.log("field names:", keysOf(vouchers[0]).join(", ") || "(none)");
  const byTypeStatus = {};
  for (const v of vouchers) {
    const k = `${v.voucherType}/${v.voucherStatus}`;
    byTypeStatus[k] = (byTypeStatus[k] ?? 0) + 1;
  }
  console.log("by type/status:", JSON.stringify(byTypeStatus));

  // 3. evaluations, with the same threshold the tools use
  console.log(`\n== evaluations (minGroup=${minGroup})`);
  console.log("aging:", JSON.stringify(agingReport(vouchers, now, minGroup)));
  console.log("revenue by month:", JSON.stringify(revenueByMonth(vouchers, minGroup)));
  console.log("concentration:", JSON.stringify(customerConcentration(vouchers, minGroup)));

  // 4. invoice details for the VAT summary (capped)
  const invoices = vouchers.filter((v) => v.voucherType === "invoice" && v.voucherStatus !== "draft" && v.voucherStatus !== "voided").slice(0, 50);
  const details = [];
  for (const inv of invoices) details.push(await client.get(`/invoices/${encodeURIComponent(inv.id)}`));
  if (details[0]) console.log("\n== invoice detail field names:", keysOf(details[0]).join(", "));
  console.log("vat summary:", JSON.stringify(vatSummary(details, minGroup)));

  // 5. per invoice: list vs detail figures, no names or addresses
  console.log("\n== per invoice (number, list total, detail net/gross/tax, tax rows)");
  for (const d of details) {
    const listItem = invoices.find((i) => i.id === d.id) ?? {};
    const tp = d.totalPrice ?? {};
    console.log(JSON.stringify({
      voucherNumber: d.voucherNumber,
      voucherStatus: d.voucherStatus,
      listTotalAmount: listItem.totalAmount,
      detailNet: tp.totalNetAmount,
      detailGross: tp.totalGrossAmount,
      detailTax: tp.totalTaxAmount,
      taxRows: Array.isArray(d.taxAmounts) ? d.taxAmounts.length : "missing",
      taxRates: Array.isArray(d.taxAmounts) ? d.taxAmounts.map((t) => t.taxRatePercentage) : null,
    }));
  }
}

main().catch((err) => {
  console.error("Live check failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
