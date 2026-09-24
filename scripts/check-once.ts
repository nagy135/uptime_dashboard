import { loadInventory } from '../src/server/config.js';
import { Store } from '../src/server/db.js';
import { Collector } from '../src/server/collector.js';
const inventory = loadInventory();
const store = new Store(process.env.DATABASE_PATH || 'data/fleet.sqlite');
store.syncInventory(inventory);
const collector = new Collector(inventory, store);
await collector.tick();
const snapshot = store.dashboard(inventory, null);
for (const device of snapshot.devices) {
  console.log(`${device.name}: SSH ${device.reachable ? 'reachable' : 'unavailable'}`);
  for (const app of device.apps) console.log(`  ${app.status.padEnd(8)} ${app.name.padEnd(28)} HTTP ${app.latest?.http?.code ?? '—'} | ${app.latest?.runtime?.message ?? 'No runtime mapping'}`);
}
store.close();
