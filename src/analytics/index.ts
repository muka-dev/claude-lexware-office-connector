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

/**
 * Minimum number of distinct customers (or invoices, for VAT) a group needs before
 * its figures are shown. Smaller groups are suppressed, because a figure based on
 * one or two customers can point to a person.
 * The default is 5. Pass 1 to disable the threshold, for example in unit tests.
 */
export const DEFAULT_MIN_GROUP = 5;

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

const customerKey = (v: VoucherListItem) => v.contactId ?? `name:${v.contactName}`;

export interface AgingBucket { total: number | null; count: number | null; suppressed?: boolean }
export interface AgingReport {
  buckets: Record<"notDue" | "1-30" | "31-60" | "61-90" | "over90", AgingBucket>;
  grandTotal: number | null;
  count: number | null;
  suppressed?: boolean;
}

/** Open receivables grouped by days past due, relative to `today`. */
export function agingReport(items: VoucherListItem[], today: Date, minGroup = DEFAULT_MIN_GROUP): AgingReport {
  type Acc = { total: number; count: number; customers: Set<string> };
  const keys = ["notDue", "1-30", "31-60", "61-90", "over90"] as const;
  const acc: Record<(typeof keys)[number], Acc> = Object.fromEntries(
    keys.map((k) => [k, { total: 0, count: 0, customers: new Set<string>() }]),
  ) as Record<(typeof keys)[number], Acc>;
  const all: Acc = { total: 0, count: 0, customers: new Set<string>() };

  for (const v of items) {
    const open = v.openAmount ?? 0;
    if (!isSalesVoucherType(v.voucherType) || open <= 0) continue;
    if (SETTLED_STATUS.has(v.voucherStatus)) continue;
    const days = v.dueDate ? Math.floor((today.getTime() - new Date(v.dueDate).getTime()) / DAY_MS) : -1;
    const key =
      days <= 0 ? "notDue" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "over90";
    for (const g of [acc[key], all]) {
      g.total = round2(g.total + open);
      g.count += 1;
      g.customers.add(customerKey(v));
    }
  }

  const finish = (g: Acc): AgingBucket =>
    g.count > 0 && g.customers.size < minGroup
      ? { total: null, count: null, suppressed: true }
      : { total: g.total, count: g.count };

  const buckets = Object.fromEntries(keys.map((k) => [k, finish(acc[k])])) as AgingReport["buckets"];
  const grand = finish(all);
  const report: AgingReport = { buckets, grandTotal: grand.total, count: grand.count };
  if (grand.suppressed) report.suppressed = true;
  return report;
}

export interface MonthRevenue { month: string; gross: number | null; count: number | null; suppressed?: boolean }

/** Gross revenue per calendar month (YYYY-MM), credit notes subtracted. */
export function revenueByMonth(items: VoucherListItem[], minGroup = DEFAULT_MIN_GROUP): MonthRevenue[] {
  const acc = new Map<string, { gross: number; count: number; customers: Set<string> }>();
  for (const v of items.filter(isRevenue)) {
    const month = v.voucherDate.slice(0, 7);
    const sign = v.voucherType === "creditnote" ? -1 : 1;
    const cur = acc.get(month) ?? { gross: 0, count: 0, customers: new Set<string>() };
    cur.gross = round2(cur.gross + sign * v.totalAmount);
    cur.count += 1;
    cur.customers.add(customerKey(v));
    acc.set(month, cur);
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, c]) =>
      c.customers.size < minGroup
        ? { month, gross: null, count: null, suppressed: true }
        : { month, gross: c.gross, count: c.count },
    );
}

export interface ConcentrationShare { rank: number; shareBand: string }
export interface Concentration {
  customerCount: number | null;
  topShares: ConcentrationShare[];
  suppressed?: boolean;
}

/** Share of total revenue held by the largest customers, as 10-point bands. No names, no amounts. */
export function customerConcentration(items: VoucherListItem[], minGroup = DEFAULT_MIN_GROUP): Concentration {
  const perCustomer = new Map<string, number>();
  let total = 0;
  for (const v of items.filter(isRevenue)) {
    const sign = v.voucherType === "creditnote" ? -1 : 1;
    const key = customerKey(v);
    perCustomer.set(key, (perCustomer.get(key) ?? 0) + sign * v.totalAmount);
    total += sign * v.totalAmount;
  }
  if (perCustomer.size < minGroup) {
    return { suppressed: true, customerCount: null, topShares: [] };
  }
  const band = (share: number) => {
    const lower = Math.min(Math.floor(share / 10) * 10, 90);
    return `${lower}–${lower + 10} %`;
  };
  const topShares = [...perCustomer.values()]
    .sort((a, b) => b - a)
    .slice(0, 3)
    .map((gross, i) => ({ rank: i + 1, shareBand: band(total > 0 ? (gross / total) * 100 : 0) }));
  return { customerCount: perCustomer.size, topShares };
}

export interface VatLine {
  taxRatePercentage: number;
  net: number | null;
  tax: number | null;
  suppressed?: boolean;
}

/** Net and VAT totals per tax rate. Draft and voided invoices are excluded. */
export function vatSummary(invoices: InvoiceDetail[], minGroup = DEFAULT_MIN_GROUP): VatLine[] {
  const acc = new Map<number, { net: number; tax: number; count: number }>();
  for (const inv of invoices) {
    if (EXCLUDED_STATUS.has(inv.voucherStatus)) continue;
    for (const t of inv.taxAmounts) {
      const cur = acc.get(t.taxRatePercentage) ?? { net: 0, tax: 0, count: 0 };
      cur.net = round2(cur.net + t.netAmount);
      cur.tax = round2(cur.tax + t.taxAmount);
      cur.count += 1;
      acc.set(t.taxRatePercentage, cur);
    }
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([taxRatePercentage, v]): VatLine =>
      v.count < minGroup
        ? { taxRatePercentage, net: null, tax: null, suppressed: true }
        : { taxRatePercentage, net: v.net, tax: v.tax },
    );
}

/** Reads LEXWARE_MIN_GROUP. Anything that is not an integer of at least 1 falls back to the default. */
export function parseMinGroup(envValue: string | undefined): number {
  const v = (envValue ?? "").trim();
  if (!/^\d+$/.test(v)) return DEFAULT_MIN_GROUP;
  const n = Number(v);
  return n >= 1 ? n : DEFAULT_MIN_GROUP;
}
