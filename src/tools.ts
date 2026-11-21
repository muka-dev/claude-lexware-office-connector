import { z } from "zod";
import type { LexwareClient, QueryValue } from "./lexoffice/client.js";
import {
  agingReport,
  revenueByMonth,
  topCustomers,
  vatSummary,
  SALES_VOUCHER_TYPES,
  type InvoiceDetail,
  type VoucherListItem,
} from "./analytics/index.js";

export interface ToolContext {
  client: Pick<LexwareClient, "get" | "getAllPages">;
  today?: () => Date;
  /** Upper bound of invoice detail calls per VAT summary (rate limit protection). */
  maxInvoiceDetails?: number;
  /** Optional redaction applied to successful results before they leave the connector. */
  redact?: (value: unknown) => unknown;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  handler: (args: any) => Promise<unknown>;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-MM-dd");
const salesType = z.enum(SALES_VOUCHER_TYPES);
const statusEnum = z.enum(["draft", "open", "paid", "paidoff", "voided", "overdue", "sepadebit", "transferred", "accepted", "rejected", "unchecked"]);

const yearStart = (d: Date) => `${d.getFullYear()}-01-01`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Builds the read-only tool set. Pure wiring: all HTTP goes through ctx.client. */
export function buildTools(ctx: ToolContext): ToolDef[] {
  const today = ctx.today ?? (() => new Date());
  const maxDetails = ctx.maxInvoiceDetails ?? 200;
  const detailCache = new Map<string, InvoiceDetail>();

  const range = (args: { from?: string; to?: string }) => {
    const now = today();
    return { from: args.from ?? yearStart(now), to: args.to ?? ymd(now) };
  };

  const listSales = (args: { from?: string; to?: string; voucherType?: string[]; voucherStatus?: string }) => {
    const { from, to } = range(args);
    const types = args.voucherType?.length ? args.voucherType : [...SALES_VOUCHER_TYPES];
    return ctx.client.getAllPages<VoucherListItem>("/voucherlist", {
      voucherType: types.join(","),
      voucherStatus: args.voucherStatus ?? "any",
      voucherDateFrom: from,
      voucherDateTo: to,
      size: 250,
    } as Record<string, QueryValue>);
  };

  const invoiceDetail = async (id: string): Promise<InvoiceDetail> => {
    const hit = detailCache.get(id);
    if (hit) return hit;
    const d = await ctx.client.get<InvoiceDetail>(`/invoices/${encodeURIComponent(id)}`);
    detailCache.set(id, d);
    return d;
  };

  const tools: ToolDef[] = [
    {
      name: "lexware_profile",
      description: "Company profile of the connected Lexware Office account: company name, tax type (net/gross/vatfree), small business flag.",
      inputSchema: {},
      handler: () => ctx.client.get("/profile"),
    },
    {
      name: "lexware_search_contacts",
      description: "Search customers and vendors by name, customer number, email, or role.",
      inputSchema: {
        name: z.string().optional(),
        number: z.number().int().optional(),
        email: z.string().optional(),
        customer: z.boolean().optional(),
        vendor: z.boolean().optional(),
        page: z.number().int().min(0).optional(),
      },
      handler: (args) =>
        ctx.client.get("/contacts", { ...args, size: 25 } as Record<string, QueryValue>),
    },
    {
      name: "lexware_get_contact",
      description: "Get one contact by its Lexware id.",
      inputSchema: { id: z.string().uuid() },
      handler: (args) => ctx.client.get(`/contacts/${encodeURIComponent(args.id)}`),
    },
    {
      name: "lexware_list_vouchers",
      description: "List sales vouchers (invoices, credit notes, quotations, order confirmations, delivery notes, down payment invoices) filtered by status and date range. Purchase and bookkeeping vouchers are not available.",
      inputSchema: {
        voucherType: z.array(salesType).optional(),
        voucherStatus: statusEnum.optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
      },
      handler: (args) => listSales(args),
    },
    {
      name: "lexware_get_invoice",
      description: "Get one invoice with line items, totals, tax amounts, and payment conditions.",
      inputSchema: { id: z.string().uuid() },
      handler: (args) => ctx.client.get(`/invoices/${encodeURIComponent(args.id)}`),
    },
    {
      name: "lexware_search_articles",
      description: "Search articles (products and services) by article number, GTIN, or type.",
      inputSchema: {
        articleNumber: z.string().optional(),
        gtin: z.string().optional(),
        type: z.enum(["PRODUCT", "SERVICE", "MATERIAL"]).optional(),
        page: z.number().int().min(0).optional(),
      },
      handler: (args) => ctx.client.get("/articles", { ...args, size: 25 } as Record<string, QueryValue>),
    },
    {
      name: "lexware_aging_report",
      description: "Open receivables (Offene Posten) grouped by days past due: not due, 1-30, 31-60, 61-90, over 90 days.",
      inputSchema: { from: isoDate.optional(), to: isoDate.optional() },
      handler: async (args) => agingReport(await listSales({ ...args, voucherType: ["invoice", "creditnote", "downpaymentinvoice"] }), today()),
    },
    {
      name: "lexware_revenue_by_month",
      description: "Gross revenue per calendar month from invoices minus credit notes. Drafts and voided documents are excluded.",
      inputSchema: { from: isoDate.optional(), to: isoDate.optional() },
      handler: async (args) => revenueByMonth(await listSales({ ...args, voucherType: ["invoice", "creditnote"] })),
    },
    {
      name: "lexware_top_customers",
      description: "Top customers by gross revenue in a period, with share of total revenue.",
      inputSchema: {
        from: isoDate.optional(),
        to: isoDate.optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      handler: async (args) =>
        topCustomers(await listSales({ ...args, voucherType: ["invoice", "creditnote"] }), args.limit ?? 10),
    },
    {
      name: "lexware_vat_summary",
      description: "Net and VAT totals per tax rate for a period (for Umsatzsteuer overviews). Loads invoice details, cached per session; capped at a fixed number of detail calls.",
      inputSchema: { from: isoDate.optional(), to: isoDate.optional() },
      handler: async (args) => {
        const items = await listSales({ ...args, voucherType: ["invoice", "creditnote"] });
        const candidates = items.filter((i) => i.voucherStatus !== "draft" && i.voucherStatus !== "voided");
        if (candidates.length > maxDetails) {
          throw new Error(`Too many invoices for one VAT summary (${candidates.length} > ${maxDetails}). Narrow the date range.`);
        }
        const details: InvoiceDetail[] = [];
        for (const c of candidates) details.push(await invoiceDetail(c.id));
        return vatSummary(details);
      },
    },
  ];

  return tools.map((t) => ({
    ...t,
    handler: async (args: any) => {
      try {
        const data = await t.handler(args ?? {});
        return ctx.redact ? ctx.redact(data) : data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, message };
      }
    },
  }));
}
