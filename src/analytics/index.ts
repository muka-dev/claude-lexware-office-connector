export const SALES_VOUCHER_TYPES = [
  "invoice",
  "creditnote",
  "downpaymentinvoice",
  "quotation",
  "orderconfirmation",
  "deliverynote",
] as const;

/** Types that count as revenue (sales-side invoices and their credit notes). */
const REVENUE_TYPES = new Set(["invoice", "creditnote"]);
const EXCLUDED_STATUS = new Set(["draft", "voided"]);
const SETTLED_STATUS = new Set(["paid", "paidoff", "voided", "draft"]);

export interface VoucherListItem {
  id: string;
  voucherType: string;
  voucherStatus: string;
  voucherNumber: string;
  voucherDate: string;
  dueDate?: string | null;
  contactId: string | null;
  contactName: string;
  totalAmount: number;
  openAmount?: number | null;
  currency: string;
  archived: boolean;
}

export interface InvoiceDetail {
  id: string;
  voucherStatus: string;
  taxAmounts: { taxRatePercentage: number; taxAmount: number; netAmount: number }[];
}

export function isSalesVoucherType(type: string): boolean {
  return (SALES_VOUCHER_TYPES as readonly string[]).includes(type);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 86_400_000;

function isRevenue(v: VoucherListItem): boolean {
  return REVENUE_TYPES.has(v.voucherType) && !EXCLUDED_STATUS.has(v.voucherStatus);
}

export interface AgingBucket { total: number; count: number }
export interface AgingReport {
  buckets: Record<"notDue" | "1-30" | "31-60" | "61-90" | "over90", AgingBucket>;
  grandTotal: number;
  count: number;
}

/** Open receivables grouped by days past due, relative to `today`. */
export function agingReport(items: VoucherListItem[], today: Date): AgingReport {
  const buckets: AgingReport["buckets"] = {
    notDue: { total: 0, count: 0 },
    "1-30": { total: 0, count: 0 },
    "31-60": { total: 0, count: 0 },
    "61-90": { total: 0, count: 0 },
    over90: { total: 0, count: 0 },
  };
  let grandTotal = 0;
  let count = 0;
  for (const v of items) {
    const open = v.openAmount ?? 0;
    if (!isSalesVoucherType(v.voucherType) || open <= 0) continue;
    if (SETTLED_STATUS.has(v.voucherStatus)) continue;
    const days = v.dueDate ? Math.floor((today.getTime() - new Date(v.dueDate).getTime()) / DAY_MS) : -1;
    const key =
      days <= 0 ? "notDue" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "over90";
    buckets[key].total = round2(buckets[key].total + open);
    buckets[key].count += 1;
    grandTotal = round2(grandTotal + open);
    count += 1;
  }
  return { buckets, grandTotal, count };
}

export interface MonthRevenue { month: string; gross: number; count: number }

/** Gross revenue per calendar month (YYYY-MM), credit notes subtracted. */
export function revenueByMonth(items: VoucherListItem[]): MonthRevenue[] {
  const acc = new Map<string, MonthRevenue>();
  for (const v of items.filter(isRevenue)) {
    const month = v.voucherDate.slice(0, 7);
    const sign = v.voucherType === "creditnote" ? -1 : 1;
    const cur = acc.get(month) ?? { month, gross: 0, count: 0 };
    cur.gross = round2(cur.gross + sign * v.totalAmount);
    cur.count += 1;
    acc.set(month, cur);
  }
  return [...acc.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface CustomerRevenue { contactName: string; gross: number; count: number; sharePercent: number }

/** Top customers by gross revenue, with share of total revenue. */
export function topCustomers(items: VoucherListItem[], limit: number): CustomerRevenue[] {
  const acc = new Map<string, { contactName: string; gross: number; count: number }>();
  let total = 0;
  for (const v of items.filter(isRevenue)) {
    const key = v.contactId ?? `name:${v.contactName}`;
    const sign = v.voucherType === "creditnote" ? -1 : 1;
    const cur = acc.get(key) ?? { contactName: v.contactName, gross: 0, count: 0 };
    cur.gross = round2(cur.gross + sign * v.totalAmount);
    cur.count += 1;
    acc.set(key, cur);
    total += sign * v.totalAmount;
  }
  return [...acc.values()]
    .sort((a, b) => b.gross - a.gross)
    .slice(0, limit)
    .map((c) => ({ ...c, sharePercent: total > 0 ? Math.round((c.gross / total) * 10000) / 100 : 0 }));
}

export interface VatLine { taxRatePercentage: number; net: number; tax: number }

/** Net and VAT totals per tax rate. Draft and voided invoices are excluded. */
export function vatSummary(invoices: InvoiceDetail[]): VatLine[] {
  const acc = new Map<number, { net: number; tax: number }>();
  for (const inv of invoices) {
    if (EXCLUDED_STATUS.has(inv.voucherStatus)) continue;
    for (const t of inv.taxAmounts) {
      const cur = acc.get(t.taxRatePercentage) ?? { net: 0, tax: 0 };
      cur.net = round2(cur.net + t.netAmount);
      cur.tax = round2(cur.tax + t.taxAmount);
      acc.set(t.taxRatePercentage, cur);
    }
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([taxRatePercentage, v]) => ({ taxRatePercentage, ...v }));
}
