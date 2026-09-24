import { loadInventory } from './config.js';
import { Store } from './db.js';
import { Collector } from './collector.js';
import { createApp } from './app.js';

const inventory = loadInventory();
const store = new Store(process.env.DATABASE_PATH || 'data/fleet.sqlite');
store.syncInventory(inventory);
const collector = new Collector(inventory, store);
const app = await createApp(inventory, store, () => collector.nextCheckAt, true);
app.addHook('onClose', async () => {
  await collector.stop();
  store.close();
});
await app.listen({ host: process.env.HOST || '0.0.0.0', port: Number(process.env.PORT || 13332) });
collector.start();
for (const event of ['SIGINT', 'SIGTERM'])
  process.once(event, () => {
    void app.close();
  });
