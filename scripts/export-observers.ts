import { mkdirSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { loadInventory } from '../src/server/config.js';
import { remoteScript } from '../src/server/collector.js';
const inventory = loadInventory();
mkdirSync('deploy/observers', { recursive: true });
for (const device of inventory.devices) {
  writeFileSync(`deploy/observers/${device.id}.sh`, '#!/usr/bin/env bash\n' + remoteScript(device));
}
// Production uses a separate key limited to a root-owned forced command on each host.
const deployed = structuredClone(inventory);
for (const device of deployed.devices) device.ssh = `root@${device.ssh.split('@').at(-1)}`;
writeFileSync(
  'deploy/fleet.json',
  await format(JSON.stringify(deployed), {
    ...(await resolveConfig('deploy/fleet.json')),
    parser: 'json',
  }),
);
