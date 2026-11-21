import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

async function connect(client: any) {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer({ client, today: () => new Date("2026-03-31T12:00:00+02:00") });
  await server.connect(serverT);
  const mcp = new Client({ name: "test", version: "0.0.0" });
  await mcp.connect(clientT);
  return { mcp, server };
}

describe("MCP server", () => {
  it("lists all read-only tools with input schemas", async () => {
    const { mcp } = await connect({ get: vi.fn(), getAllPages: vi.fn() });
    const { tools } = await mcp.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("lexware_profile");
    expect(names).toContain("lexware_aging_report");
    expect(tools.every((t) => t.inputSchema && t.inputSchema.type === "object")).toBe(true);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });

  it("calls a tool and returns JSON text content", async () => {
    const client = {
      get: vi.fn(async () => ({ companyName: "Testfirma GmbH" })),
      getAllPages: vi.fn(),
    };
    const { mcp } = await connect(client);
    const res: any = await mcp.callTool({ name: "lexware_profile", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual({ companyName: "Testfirma GmbH" });
  });

  it("marks tool-level failures as isError without crashing the server", async () => {
    const client = {
      get: vi.fn(async () => { throw new Error("Lexware API error 429 on /profile"); }),
      getAllPages: vi.fn(),
    };
    const { mcp } = await connect(client);
    const res: any = await mcp.callTool({ name: "lexware_profile", arguments: {} });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("429");
  });

  it("rejects invalid arguments via the schema", async () => {
    const { mcp } = await connect({ get: vi.fn(), getAllPages: vi.fn() });
    const res: any = await mcp.callTool({
      name: "lexware_list_vouchers",
      arguments: { voucherType: ["purchaseinvoice"] },
    }).catch((e: unknown) => ({ isError: true, message: String(e) }));
    expect(res.isError).toBe(true);
  });
});
