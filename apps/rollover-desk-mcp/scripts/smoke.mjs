// Starts the real server over stdio, as Claude Code does, and calls every tool against a running API.
// Needs the API running with a confirmed rent roll. Usage: pnpm --filter rollover-desk-mcp smoke
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const transport = new StdioClientTransport({
  command: fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url)),
  args: ['src/server.ts'],
  cwd: root,
  env: {
    ...process.env,
    ROLLOVER_DESK_EMAIL: process.env.ROLLOVER_DESK_EMAIL ?? 'viewer@prairie-ridge.example',
    ROLLOVER_DESK_PASSWORD: process.env.ROLLOVER_DESK_PASSWORD ?? 'demo-prairie-viewer',
  },
  stderr: 'inherit',
});
const client = new Client({ name: 'smoke', version: '0' });
await client.connect(transport);

const call = async (name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, `${name}: ${result.content[0]?.text}`);
  console.log(`ok: ${name}`);
  return JSON.parse(result.content[0].text).data;
};

const { tools } = await client.listTools();
console.log(`ok: ${tools.length} tools listed`);
const { properties } = await call('list_properties');
assert.ok(properties.length > 0, 'No properties visible. Seed the database first.');
const propertyId = properties[0].id;
const rollover = await call('get_rollover', { propertyId });
console.log(`   total rent $${(rollover.schedule.totals.annualRentCents / 100).toLocaleString('en-US')}`);
await call('get_critical_dates', { propertyId });
const { leases } = await call('list_leases', { propertyId });
const scored = leases.find((l) => l.risk.scored);
assert.ok(
  scored,
  'No scored lease. Confirm a rent roll first, for example data/synthetic/samples/clean.xlsx.',
);
const lease = await call('explain_lease_risk', { propertyId, leaseId: scored.id });
console.log(
  `   suite ${lease.suite}: risk ${lease.risk.score.toFixed(1)} from ${lease.risk.components.length} components`,
);
await call('get_attention', { propertyId });
await client.close();
console.log('Smoke test passed.');
