#!/usr/bin/env bash
set -u
printf 'ready 49fe7922667608bd\n'
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'bread.infiniter.tech:443:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'https://bread.infiniter.tech/' 2>/dev/null); printf '0\thttp\t%s\n' "$result" ) &
( result=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' -- 'bread-comparison-app-1' 2>/dev/null) || result=unknown; printf '0\truntime\t%s\n' "$result" ) &
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'conversation.infiniter.tech:443:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'https://conversation.infiniter.tech/' 2>/dev/null); printf '1\thttp\t%s\n' "$result" ) &
( result=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' -- 'conversation-app-1' 2>/dev/null) || result=unknown; printf '1\truntime\t%s\n' "$result" ) &
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'drive.infiniter.tech:80:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'http://drive.infiniter.tech/' 2>/dev/null); printf '2\thttp\t%s\n' "$result" ) &
( result=$(systemctl show --property=ActiveState --value -- 'phpfpm-nextcloud.service' 2>/dev/null) || result=unknown; printf '2\truntime\t%s\n' "$result" ) &
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'fit-api.infiniter.tech:443:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'https://fit-api.infiniter.tech/health' 2>/dev/null); printf '3\thttp\t%s\n' "$result" ) &
( result=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' -- 'fitness-tracker' 2>/dev/null) || result=unknown; printf '3\truntime\t%s\n' "$result" ) &
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'fit.infiniter.tech:443:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'https://fit.infiniter.tech/' 2>/dev/null); printf '4\thttp\t%s\n' "$result" ) &
( result=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' -- 'fitness-tracker-frontend' 2>/dev/null) || result=unknown; printf '4\truntime\t%s\n' "$result" ) &
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'fitness-ai-auth.infiniter.tech:443:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'https://fitness-ai-auth.infiniter.tech/api/auth/ok' 2>/dev/null); printf '5\thttp\t%s\n' "$result" ) &
( result=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' -- 'fitness-ai-convex' 2>/dev/null) || result=unknown; printf '5\truntime\t%s\n' "$result" ) &
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'fitness-ai-dashboard.infiniter.tech:443:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'https://fitness-ai-dashboard.infiniter.tech/' 2>/dev/null); printf '6\thttp\t%s\n' "$result" ) &
( result=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' -- 'fitness-ai-dashboard' 2>/dev/null) || result=unknown; printf '6\truntime\t%s\n' "$result" ) &
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'fitness-ai.infiniter.tech:443:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'https://fitness-ai.infiniter.tech/' 2>/dev/null); printf '7\thttp\t%s\n' "$result" ) &
( result=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' -- 'fitness-ai-convex' 2>/dev/null) || result=unknown; printf '7\truntime\t%s\n' "$result" ) &
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'office.infiniter.tech:443:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'https://office.infiniter.tech/' 2>/dev/null); printf '8\thttp\t%s\n' "$result" ) &
( result=$(systemctl show --property=ActiveState --value -- 'agent-office.service' 2>/dev/null) || result=unknown; printf '8\truntime\t%s\n' "$result" ) &
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'pi-status.infiniter.tech:443:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'https://pi-status.infiniter.tech/' 2>/dev/null); printf '9\thttp\t%s\n' "$result" ) &
( result=$(systemctl show --property=ActiveState --value -- 'grafana.service' 2>/dev/null) || result=unknown; printf '9\truntime\t%s\n' "$result" ) &
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'relay.infiniter.tech:443:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'https://relay.infiniter.tech/' 2>/dev/null); printf '10\thttp\t%s\n' "$result" ) &
( result=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' -- 'file-relay-relay-1' 2>/dev/null) || result=unknown; printf '10\truntime\t%s\n' "$result" ) &
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'speech.infiniter.tech:443:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'https://speech.infiniter.tech/' 2>/dev/null); printf '11\thttp\t%s\n' "$result" ) &
( result=$(docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' -- 'agentic_speech_demo-app-1' 2>/dev/null) || result=unknown; printf '11\truntime\t%s\n' "$result" ) &
( result=$(curl --silent --output /dev/null --connect-timeout 3 --max-time 7 --noproxy '*' --resolve 'uptime.infiniter.tech:443:127.0.0.1' --write-out '%{http_code}\t%{time_total}' 'https://uptime.infiniter.tech/api/health' 2>/dev/null); printf '12\thttp\t%s\n' "$result" ) &
( result=$(systemctl show --property=ActiveState --value -- 'docker-uptime-dashboard.service' 2>/dev/null) || result=unknown; printf '12\truntime\t%s\n' "$result" ) &
( result=$(systemctl show --property=ActiveState --value -- 'sshd.service' 2>/dev/null) || result=unknown; printf '13\truntime\t%s\n' "$result" ) &
( result=$(systemctl show --property=ActiveState --value -- 'tailscaled.service' 2>/dev/null) || result=unknown; printf '14\truntime\t%s\n' "$result" ) &
( result=$(systemctl show --property=ActiveState --value -- 'nginx.service' 2>/dev/null) || result=unknown; printf '15\truntime\t%s\n' "$result" ) &
( result=$(systemctl show --property=ActiveState --value -- 't3code.service' 2>/dev/null) || result=unknown; printf '16\truntime\t%s\n' "$result" ) &
wait
