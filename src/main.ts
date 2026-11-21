#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LexwareClient } from "./lexoffice/client.js";
import { createServer } from "./server.js";

async function main() {
  const apiKey = process.env.LEXOFFICE_API_KEY ?? "";
  // stdout is the MCP channel: log to stderr only, and never log the key.
  const client = new LexwareClient({ apiKey });
  const server = createServer({ client });
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("Failed to start Lexware connector:", err instanceof Error ? err.message : err);
  process.exit(1);
});
