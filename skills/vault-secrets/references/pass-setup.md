# pass + direnv setup, and the value-move recipes

This reference holds the concrete setup and command recipes for the one backend this skill uses: GNU `pass`, with `direnv` as the runtime mechanism. The doctrine in `vaulting-doctrine.md` decides *whether* and *when* to vault; this file is the *how*.

## 1. Install and initialize `pass`

Install `pass` and ensure a GPG key exists.

```bash
# Install (pick your platform)
brew install pass        # macOS
sudo apt install pass     # Debian/Ubuntu

# Check for an existing GPG key:
gpg --list-secret-keys --keyid-format=long
```

If `gpg --list-secret-keys` shows a key, note its ID (the long hex after `sec   rsaNNNN/`). If there is **no** key, generate one:

```bash
gpg --gen-key   # follow the prompts: name, email, passphrase
```

Initialize the password store against the key (use the key ID or the email):

```bash
pass init <gpg-key-id-or-email>
pass ls   # should print an (empty) store tree without error
```

## 2. Install and hook `direnv`

```bash
brew install direnv       # macOS
sudo apt install direnv    # Debian/Ubuntu
```

Add the hook to your shell rc, then restart the shell:

```bash
# zsh (~/.zshrc):
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
# bash (~/.bashrc):
echo 'eval "$(direnv hook bash)"' >> ~/.bashrc
exec "$SHELL"
```

## 3. The value-extraction idiom

Recipes extract a single value from a `.env`-style line:

```bash
sed -nE 's/^(export[[:space:]]+)?<KEY>=//p' "<FILE>" | sed -E 's/^"//; s/"$//' | tr -d '\n'
```

The first `sed` prints only the text after `<KEY>=` for the matching line; the optional `(export[[:space:]]+)?` also matches `export <KEY>=...`. The second `sed` strips one leading/trailing double-quote. `tr -d '\n'` strips the trailing newline so `pass` stores the value verbatim. POSIX-portable; the value is written only into the pipe, never to a terminal.

This single-line idiom is for SINGLE-LINE secrets only. Multiline/structured secrets are out of scope in this version (see SKILL.md "Not yet supported").

## 4. No-echo INSERT (the user-run step)

The value flows file -> pipe -> `pass` stdin only. It never appears in argv, stdout, the transcript, or shell history:

```bash
sed -nE 's/^(export[[:space:]]+)?<KEY>=//p' "<FILE>" | sed -E 's/^"//; s/"$//' | tr -d '\n' \
  | pass insert -m -f "<project>/<KEY>"
```

`pass insert -m` reads stdin until EOF; the pipe closes stdin, so it terminates. `-f` overwrites an existing entry without prompting. Use the entry convention `<project>/<KEY>`, e.g. `myproj/DATABASE_URL`.

To confirm the entry exists without printing its value:

```bash
pass ls "<project>"          # shows the entry name under the project tree
```

## 5. Runtime reference — primary: direnv + .envrc

Add to the project's `.envrc` (one line per key):

```bash
export <KEY>=$(pass show <project>/<KEY>)
```

Then authorize it:

```bash
direnv allow
```

`direnv` runs the `.envrc` on `cd` into the directory and exports the values into the real process environment. Apps using `python-dotenv` / `dotenv` (npm) / `godotenv` read them from the environment (`os.environ` / `process.env`) — no `$(...)` evaluation by the app is needed. The `.envrc` contains only `pass show` calls (no plaintext) and is safe to commit.

## 6. Runtime reference — fallback: render to a temp file

For consumers that do NOT inherit a shell environment — Docker, `launchd`/`systemd` services, GUI/Spotlight launches — `direnv` cannot help. Render a temporary env file from `pass` at launch and delete it immediately. The USER runs this (it touches plaintext); the agent authors it.

```bash
umask 077
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
printf '%s=%s\n' "<KEY>" "$(pass show <project>/<KEY>)" >> "$TMP"
# then, e.g.:
docker run --env-file "$TMP" <image>        # Docker
# or
dotenv -f "$TMP" -- <your-app>              # dotenv-cli
```

The temp file is 600-perms (`umask 077`), trap-cleaned on exit, and must never be committed.
