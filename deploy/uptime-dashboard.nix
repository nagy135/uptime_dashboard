{pkgs, ...}: {
  # Build the image on nixpi from the committed uptime_dashboard checkout first.
  virtualisation.oci-containers.containers.uptime-dashboard = {
    image = "uptime-dashboard:local";
    pull = "never";
    ports = ["127.0.0.1:13332:13332"];
    volumes = [
      "/var/lib/uptime-dashboard/data:/app/data"
      "/var/lib/uptime-dashboard/ssh:/app/ssh:ro"
      "/var/lib/uptime-dashboard/fleet.json:/app/config/fleet.json:ro"
    ];
    environment = {
      SSH_IDENTITY_FILE = "/app/ssh/id_ed25519";
      SSH_KNOWN_HOSTS_FILE = "/app/ssh/known_hosts";
    };
    extraOptions = ["--cap-drop=ALL" "--security-opt=no-new-privileges" "--read-only" "--tmpfs=/tmp:rw,noexec,nosuid,size=16m"];
  };
  services.nginx.virtualHosts."status.infiniter.tech" = {
    enableACME = true;
    forceSSL = true;
    locations."/".proxyPass = "http://127.0.0.1:13332";
  };
  services.infiniter.websupportDDNS.records = ["status"];
  systemd.services.uptime-dashboard-backup = {
    description = "Back up the fleet status SQLite database";
    serviceConfig = { Type = "oneshot"; UMask = "0077"; };
    path = [pkgs.sqlite pkgs.coreutils pkgs.findutils];
    script = ''
      set -eu
      mkdir -p /var/lib/uptime-dashboard/backups
      if [ -f /var/lib/uptime-dashboard/data/fleet.sqlite ]; then
        sqlite3 /var/lib/uptime-dashboard/data/fleet.sqlite ".backup '/var/lib/uptime-dashboard/backups/fleet-$(date -u +%F).sqlite'"
        find /var/lib/uptime-dashboard/backups -name 'fleet-*.sqlite' -mtime +7 -delete
      fi
    '';
  };
  systemd.timers.uptime-dashboard-backup = {
    wantedBy = ["timers.target"];
    timerConfig = { OnCalendar = "daily"; Persistent = true; };
  };
}
