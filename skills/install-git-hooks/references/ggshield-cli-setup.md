# ggshield CLI setup

Use this reference when a skill needs `ggshield` but `ggshield --version` fails, `ggshield api-status` fails, or the user needs headless/CI authentication. Return to the active skill once setup verifies successfully.

## Setup contract

Run setup in one session before declaring the skill ready:

1. Brief the user on why `ggshield` is needed for the active skill.
2. Install `ggshield` using the first available path below.
3. Authenticate with `ggshield auth login`.
4. Verify with `ggshield --version` and `ggshield api-status`.

Pause only when a command must run in the user's own terminal, such as browser-based `ggshield auth login`, or when every documented fallback is exhausted.

## Install ggshield

Start with:

```bash
ggshield --version
```

If it fails, detect what already exists on the user's machine. Prefer install paths that keep upgrades easy. Probe in this order and use the first suitable manager that responds to a `--version` check.

### 1. Platform-native package manager

| Platform | Probe | Install command |
|---|---|---|
| macOS | `brew --version` | `brew install ggshield` |
| Windows | `choco --version` | `choco install ggshield` |
| Linux Debian/Ubuntu | `apt --version` | Set up the Cloudsmith repo at https://cloudsmith.io/~gitguardian/repos/ggshield/setup/, then `apt install ggshield` |
| Linux RHEL/Fedora | `dnf --version` | Set up the Cloudsmith repo at the same URL, rpm tab, then `dnf install ggshield` |

### 2. Python-based managers

| Probe | Install command | Notes |
|---|---|---|
| `uv --version` | `uv tool install ggshield` | Upgrade later with `uv tool upgrade ggshield` |
| `pipx --version` | `pipx install ggshield` | Isolated environment |
| `pip --version` | `pip install --user ggshield` | Last resort among existing Python tools. May fail on externally managed Python |

### 3. Install uv if no existing manager works

Use this before direct download when no existing package manager can install `ggshield`. `uv` is lightweight, cross-platform, and keeps future upgrades simple. Unlike package-manager installs, this fetches a shell script at runtime, so do not pipe it directly to `sh`. Download it first, let the user inspect it or verify it against the checksum published in the uv install docs, then execute only after they confirm:

```bash
# Step 1: download the installer without executing it
curl -LsSf https://astral.sh/uv/install.sh -o /tmp/uv-install.sh

# Step 2: ask the user to inspect /tmp/uv-install.sh or verify its checksum
# against https://docs.astral.sh/uv/getting-started/installation/

# Step 3: once the user confirms, execute and load uv onto PATH
sh /tmp/uv-install.sh && . ~/.bashrc
uv tool install ggshield
```

Replace `~/.bashrc` with the user's shell file, such as `~/.zshrc`. If the user prefers not to run an unverified remote installer, skip to direct download only after explaining its manual-upgrade tradeoff.

### 4. Direct download from GitHub releases

Use this only as the final fallback when package managers and Python-based managers are unavailable or fail.

Before using direct download, tell the user: this path installs a release artifact directly and does not register an upstream package repository or tool-manager environment. Future upgrades require manually rerunning the download and install steps, so this has more maintenance friction than `brew`, `choco`, `apt`/`dnf` with Cloudsmith, `uv`, `pipx`, or `pip`.

Pick the artifact by detecting OS and architecture with `uname -s`, `uname -m`, `/etc/os-release`, or `$Env:PROCESSOR_ARCHITECTURE` on PowerShell:

| OS / arch | Artifact (`<v>` = latest version) | Install command after download |
|---|---|---|
| macOS Apple Silicon (`Darwin arm64`) | `ggshield-<v>-arm64-apple-darwin.pkg` | `sudo installer -pkg <file>.pkg -target /` |
| macOS Intel (`Darwin x86_64`) | `ggshield-<v>-x86_64-apple-darwin.pkg` | `sudo installer -pkg <file>.pkg -target /` |
| Debian/Ubuntu (`Linux x86_64`) | `ggshield_<v>-1_amd64.deb` | `sudo apt install ./<file>.deb` |
| RHEL/Fedora (`Linux x86_64`) | `ggshield-<v>-1.x86_64.rpm` | `sudo dnf install <file>.rpm` |
| Windows x86_64 | `ggshield-<v>-x86_64-pc-windows-msvc.msi` | `msiexec /i <file>.msi /quiet` or run interactively |
| Other glibc-based Linux x86_64 (Arch, openSUSE, etc.) | `ggshield-<v>-x86_64-unknown-linux-gnu.tar.gz` | `tar -xzf <file>.tar.gz && mkdir -p ~/.local/bin && mv ggshield ~/.local/bin/` |

Download with whatever HTTP tool is available:

```bash
ASSET_SUFFIX="<artifact-suffix-from-table>"
gh release download --repo GitGuardian/ggshield --pattern "*${ASSET_SUFFIX}"
```

```bash
ASSET_SUFFIX="<artifact-suffix-from-table>"
url=$(curl -sL https://api.github.com/repos/GitGuardian/ggshield/releases/latest \
      | grep -o "\"browser_download_url\": *\"[^\"]*${ASSET_SUFFIX}\"" \
      | cut -d'"' -f4)
curl -LO "$url"
```

```bash
ASSET_SUFFIX="<artifact-suffix-from-table>"
url=$(wget -qO- https://api.github.com/repos/GitGuardian/ggshield/releases/latest \
      | grep -o "\"browser_download_url\": *\"[^\"]*${ASSET_SUFFIX}\"" \
      | cut -d'"' -f4)
wget "$url"
```

```powershell
$AssetSuffix = '<artifact-suffix-from-table>'
$latest = Invoke-RestMethod https://api.github.com/repos/GitGuardian/ggshield/releases/latest
$asset = $latest.assets | Where-Object { $_.name -like "*$AssetSuffix" }
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile ggshield.msi
```

**Verify the download (ggshield 1.51.0+).** Release binaries on GitHub Releases ship with [GitHub Artifact Attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds) — signed SLSA build provenance. After downloading, verify the asset before installing:

```bash
gh attestation verify <downloaded-file> --repo GitGuardian/ggshield
```

Tool managers such as mise (via the aqua backend) verify automatically at install time, so this manual step is only needed for the direct-download path.

Not supported by direct download: Linux ARM, Windows ARM, and Alpine/musl Linux. If direct download is unsupported, stop and ask the user how they want to proceed.

After any install path, confirm the binary is on the normal PATH:

```bash
which ggshield      # macOS/Linux
where ggshield      # Windows
ggshield --version
```

## Authenticate and verify

Give the user the login command. By default, it targets SaaS US:

```bash
ggshield auth login
ggshield auth login --instance https://dashboard.eu1.gitguardian.com
ggshield auth login --instance https://<their-instance-url>
```

Tell the user it opens a browser to authorize the workstation. Once they confirm it succeeded, verify:

```bash
ggshield api-status
```

As of ggshield 1.51.0, `ggshield api-status` also reports the **workspace ID** bound to the current token (in both text and `--json` output) — useful for confirming the user authenticated against the intended workspace.

## Headless and CI

When `ggshield auth login` cannot open a browser (SSH session, container, headless server), there are two no-browser paths.

**Out-of-band OAuth (`--method oob`, ggshield 1.51.0+ — preferred for interactive headless shells).** `ggshield` prints an authorization URL; the user opens it on any device with a browser, signs in, and pastes the code shown by the dashboard back into the terminal. No token to create by hand:

```bash
ggshield auth login --method oob
ggshield auth login --method oob --instance https://dashboard.eu1.gitguardian.com
```

This uses the OAuth out-of-band sentinel (`urn:ietf:wg:oauth:2.0:oob`) and requires a GitGuardian instance that supports it.

**Token auth (works on any version).** The user creates a Personal Access Token with the `scan` scope, then runs:

```bash
ggshield auth login --method token
ggshield auth login --method token --instance https://dashboard.eu1.gitguardian.com
```

For stateless CI jobs, skip login and set `GITGUARDIAN_API_KEY` as a pipeline secret. `ggshield` reads it directly.

## Agent and git hooks

When the active skill needs hooks, install them after the CLI is authenticated:

```bash
ggshield install -t claude-code -m global
ggshield install -t cursor -m global
ggshield install -t copilot -m global
ggshield install -t codex -m global          # ggshield 1.51.0+
ggshield install -t vscode -m global         # alias for copilot; ggshield 1.51.0+
ggshield install --mode local --hook-type pre-commit
ggshield install --mode local --hook-type pre-push
```

Agent hooks require `ggshield` 1.49.0 or later. The `codex` target and the `vscode` alias (for `copilot`) require 1.51.0 or later — the Codex hook is backed by Codex support added to `ggshield secret scan ai-hook` in 1.51.0.

## What's new in ggshield 1.51.0

Released 2026-05-26. The features relevant to these skills, and where they apply above:

- **Browser-less login** — `ggshield auth login --method oob` for SSH sessions, containers, and headless servers. See [Headless and CI](#headless-and-ci).
- **Codex agent hook** — `ggshield install -t codex`, backed by Codex support in `ggshield secret scan ai-hook`. See [Agent and git hooks](#agent-and-git-hooks).
- **`vscode` hook alias** — `ggshield install -t vscode` now aliases `copilot`.
- **Signed release binaries** — GitHub Releases assets ship with GitHub Artifact Attestations (SLSA provenance); verify with `gh attestation verify <file> --repo GitGuardian/ggshield`. See [Direct download from GitHub releases](#4-direct-download-from-github-releases).
- **Plugins served from your instance** — `ggshield plugin install` / `update` / `status` now discover and pull plugins from the GitGuardian instance you're authenticated against (via `/v1/endpoints/plugins/<reference>/{download,signature}`) instead of a hard-coded GitHub URL. Requires the matching backend feature. This is the install path for the `machine_scan` plugin used by the scan-machine skill.
- **`api-status` reports the workspace ID** — text and `--json` output now include the workspace bound to the current token. See [Authenticate and verify](#authenticate-and-verify).
- **MCP-server detection** — ggshield now detects MCP servers installed via Claude plugins / Claude.ai and via Cursor plugins / extensions, feeding the AI-hook secret scanning.
