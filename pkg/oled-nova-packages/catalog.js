/*
 * A small curated "knowledge" dataset used by the Recommended tab.
 *
 * We can't introspect what every package does, so we map common packages into
 * use-case categories plus a "related" graph. Recommendations are derived from
 * what is already installed: if a category is in use we suggest its other
 * members, and if a package has related tools we suggest those too.
 */

export const CATEGORIES = [
    {
        id: "web",
        label: "Web serving",
        packages: ["nginx", "apache2", "httpd", "caddy", "lighttpd", "traefik", "haproxy"],
    },
    {
        id: "database",
        label: "Databases",
        packages: ["postgresql", "mariadb-server", "mysql-server", "redis-server", "mongodb", "sqlite3", "influxdb"],
    },
    {
        id: "container",
        label: "Containers",
        packages: ["docker.io", "docker-ce", "podman", "containerd", "kubernetes", "minikube", "docker-compose"],
    },
    {
        id: "editor",
        label: "Editors",
        packages: ["vim", "neovim", "emacs", "nano", "micro", "code", "helix"],
    },
    {
        id: "monitor",
        label: "Monitoring & tools",
        packages: ["htop", "btop", "glances", "netdata", "prometheus", "node-exporter", "iotop", "iftop", "ncdu", "tmux", "screen"],
    },
    {
        id: "network",
        label: "Networking",
        packages: ["curl", "wget", "net-tools", "dnsutils", "traceroute", "mtr-tiny", "nmap", "socat", "tcpdump", "wireguard", "openvpn", "rsync"],
    },
    {
        id: "lang",
        label: "Languages & runtimes",
        packages: ["python3", "python3-pip", "nodejs", "npm", "golang", "rustc", "cargo", "openjdk-17-jdk", "php", "ruby", "perl"],
    },
    {
        id: "build",
        label: "Build tools",
        packages: ["build-essential", "cmake", "make", "gcc", "g++", "clang", "meson", "ninja-build", "pkg-config", "autoconf"],
    },
    {
        id: "git",
        label: "Version control",
        packages: ["git", "git-lfs", "subversion", "mercurial", "gh"],
    },
    {
        id: "media",
        label: "Media",
        packages: ["ffmpeg", "imagemagick", "vlc", "gimp", "inkscape", "yt-dlp"],
    },
    {
        id: "security",
        label: "Security",
        packages: ["ufw", "firewalld", "fail2ban", "clamav", "gnupg", "openssl", "nftables"],
    },
    {
        id: "backup",
        label: "Backup & sync",
        packages: ["restic", "borgbackup", "rsync", "rclone", "duplicity", "syncthing"],
    },
];

/* Packages that are commonly used together, even across categories. */
export const RELATED = {
    nginx: ["certbot", "mariadb-server", "php-fpm"],
    apache2: ["certbot", "mariadb-server", "php"],
    "docker.io": ["docker-compose", "portainer"],
    podman: ["podman-compose", "buildah", "skopeo"],
    postgresql: ["pgadmin4", "postgresql-contrib"],
    "mariadb-server": ["mariadb-client", "phpmyadmin"],
    git: ["git-lfs", "tig", "gh"],
    nodejs: ["npm", "yarn", "pnpm"],
    python3: ["python3-pip", "python3-venv", "pipx"],
    "redis-server": ["redis-tools"],
    vim: ["vim-nox", "vim-airline"],
    htop: ["btop", "glances"],
    ffmpeg: ["yt-dlp", "mkvtoolnix"],
    wireguard: ["wireguard-tools"],
    restic: ["rclone"],
};

/* Packages that are almost always worth having. Only shown when not installed. */
export const STARTER = ["curl", "wget", "git", "htop", "tmux", "rsync", "vim", "unzip", "ca-certificates"];

/**
 * Build recommendation entries from a set of installed package names.
 *
 * @param {Set<string>} installed - names (no arch/version) that are installed
 * @returns {{name: string, reason: string}[]}
 */
export function recommend(installed) {
    const out = [];
    const seen = new Set();

    const push = (name, reason) => {
        if (!name || seen.has(name) || installed.has(name))
            return;
        seen.add(name);
        out.push({ name, reason });
    };

    /* 1. Categories the user already uses -> suggest sibling packages. */
    for (const cat of CATEGORIES) {
        const in_use = cat.packages.filter(p => installed.has(p));
        if (in_use.length === 0)
            continue;
        // pick the installed package with the most "signal" (first match)
        const anchor = in_use[0];
        for (const p of cat.packages.filter(x => !installed.has(x)).slice(0, 3))
            push(p, `You use ${anchor} — more ${cat.label.toLowerCase()}`);
    }

    /* 2. Explicit related tools. */
    for (const [pkg, rel] of Object.entries(RELATED)) {
        if (!installed.has(pkg))
            continue;
        for (const p of rel)
            push(p, `Commonly used with ${pkg}`);
    }

    /* 3. Fill up with starter packages if we still have room. */
    if (out.length < 6) {
        for (const p of STARTER)
            push(p, "Recommended baseline tool");
    }

    return out.slice(0, 18);
}
