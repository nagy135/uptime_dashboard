import { readFileSync } from 'node:fs';
import { z } from 'zod';

const identifier = z.string().regex(/^[a-zA-Z0-9_.:@/-]+$/).max(200);
const runtime = z.object({ type: z.enum(['systemd', 'docker']), name: identifier, label: z.string().max(80) });
const app = z.object({
  id: identifier, name: z.string().min(1).max(100),
  kind: z.enum(['application', 'static', 'external', 'service']),
  url: z.string().url().refine(v => ['http:', 'https:'].includes(new URL(v).protocol)).optional(),
  healthPath: z.string().startsWith('/').refine(v => !v.startsWith('//')).optional(),
  reachabilityCodes: z.array(z.number().int().min(100).max(599)).optional(),
  domain: z.string().regex(/^[a-zA-Z0-9.-]+$/).optional(),
  runtime: runtime.optional(),
  acceptedCodes: z.array(z.number().int().min(100).max(599)).optional(),
  protected: z.boolean().default(false),
  publicCheck: z.boolean().default(true),
});
export const inventorySchema = z.object({
  updatedAt: z.string(), revision: z.string(),
  devices: z.array(z.object({
    id: identifier, name: z.string(), subtitle: z.string(),
    ssh: z.string().regex(/^[a-zA-Z0-9_.@:-]+$/).refine(v => !v.startsWith('-')),
    apps: z.array(app).max(100),
  })).min(1),
}).superRefine((data, ctx) => {
  const ids = [...data.devices.map(d => `device:${d.id}`), ...data.devices.flatMap(d => d.apps.map(a => a.id))];
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Inventory IDs must be unique' });
  for (const d of data.devices) for (const a of d.apps) {
    if (!a.url && !a.runtime) ctx.addIssue({ code: 'custom', message: `${a.id}: no check target` });
  }
});
export type Inventory = z.infer<typeof inventorySchema>;
export type Device = Inventory['devices'][number];
export type App = Device['apps'][number];
export const POLL_INTERVAL = 30_000;
export const STALE_AFTER = 90_000;
export function loadInventory(path = process.env.INVENTORY_PATH || 'config/fleet.json'): Inventory {
  return inventorySchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}
