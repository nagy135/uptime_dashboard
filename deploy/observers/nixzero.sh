#!/usr/bin/env bash
set -u
printf 'ready 0fe4609b183b0d5c\n'
( result=$(systemctl show --property=ActiveState --value -- 'sshd.service' 2>/dev/null) || result=unknown; printf '0\truntime\t%s\n' "$result" ) &
( result=$(systemctl show --property=ActiveState --value -- 'tailscaled.service' 2>/dev/null) || result=unknown; printf '1\truntime\t%s\n' "$result" ) &
wait
