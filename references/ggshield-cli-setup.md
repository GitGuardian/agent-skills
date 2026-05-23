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

Use this before direct download when no existing package manager can install `ggshield`. `uv` is lightweight, cross-platform, and keeps future upgrades simple:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.bashrc
uv tool install ggshield
```

Replace `~/.bashrc` with the user's shell file, such as `~/.zshrc`.

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

## Headless and CI

When `ggshield auth login` cannot open a browser, use token auth. The user creates a Personal Access Token with the `scan` scope, then runs:

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
ggshield install --mode local --hook-type pre-commit
ggshield install --mode local --hook-type pre-push
```

Agent hooks require `ggshield` 1.49.0 or later.
