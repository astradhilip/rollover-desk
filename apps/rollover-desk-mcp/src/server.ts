// Read-only MCP server over the rollover-desk API, on stdio. Stdout carries the protocol, so logs go to stderr.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSession } from './session';
import { registerTools } from './tools';

const email = process.env.ROLLOVER_DESK_EMAIL;
const password = process.env.ROLLOVER_DESK_PASSWORD;
if (!email || !password) {
  console.error('Set ROLLOVER_DESK_EMAIL and ROLLOVER_DESK_PASSWORD. A viewer account is enough.');
  process.exit(1);
}

const server = new McpServer({ name: 'rollover-desk', version: '0.1.0' });
registerTools(
  server,
  createSession({ apiUrl: process.env.ROLLOVER_DESK_API_URL || 'http://localhost:4000', email, password }),
);
await server.connect(new StdioServerTransport());
console.error('rollover-desk MCP server ready on stdio');
