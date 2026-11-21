#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LexwareClient } from "./lexoffice/client.js";
import { createServer } from "./server.js";
import { Redactor } from "./redact/index.js";

async function main() {
  const apiKey = process.env.LEXOFFICE_API_KEY ?? "";
  // stdout is the MCP channel: log to stderr only, and never log the key.
  const client = new LexwareClient({ apiKey });
  // LEXWARE_REDACT=1 pseudonymizes names and removes addresses and tax IDs
  // before results reach the model. Off by default, so name searches keep working.
  const redactOn = ["1", "true", "yes"].includes((process.env.LEXWARE_REDACT ?? "").toLowerCase());
  // One Redactor per process, so the same person gets the same pseudonym across tool calls.
  const redactor = new Redactor();
  const server = createServer({
    client,
    redact: redactOn ? (v) => redactor.redact(v) : undefined,
  });
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("Failed to start Lexware connector:", err instanceof Error ? err.message : err);
  process.exit(1);
});
