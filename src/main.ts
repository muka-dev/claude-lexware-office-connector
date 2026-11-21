#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LexwareClient } from "./lexoffice/client.js";
import { createServer } from "./server.js";
import { Redactor, redactionEnabled } from "./redact/index.js";
import { parseMinGroup } from "./analytics/index.js";

async function main() {
  const apiKey = process.env.LEXOFFICE_API_KEY ?? "";
  // stdout is the MCP channel: log to stderr only, and never log the key.
  const client = new LexwareClient({ apiKey });
  // Redaction is on by default: names become pseudonyms, addresses and tax IDs are removed
  // before results reach the model. Set LEXWARE_REDACT=0 only if plain names are needed.
  const redactOn = redactionEnabled(process.env.LEXWARE_REDACT);
  // One Redactor per process, so the same person gets the same pseudonym across tool calls.
  const redactor = new Redactor();
  const server = createServer({
    client,
    redact: redactOn ? (v) => redactor.redact(v) : undefined,
    // Evaluations hide groups with fewer distinct customers than this (default 5).
    minGroupSize: parseMinGroup(process.env.LEXWARE_MIN_GROUP),
  });
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error("Failed to start Lexware connector:", err instanceof Error ? err.message : err);
  process.exit(1);
});
