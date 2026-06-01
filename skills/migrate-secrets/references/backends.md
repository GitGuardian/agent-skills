# Backend adapter table

One capability, seven tools. For each backend: how to confirm it is installed **and** authenticated, how to store a value **without putting it in argv** (so it never lands in shell history), the path/key naming convention, and the reference syntax to put back in code.

**Rule for every backend:** pass the secret value via **stdin or a file**, never as a literal command-line argument. Where a CLI's simple form only accepts the value as an argv flag (noted as "argv caution" below), use the safer form shown, or write the value to a temp file (`umask 077`), pass `file://` or `--file`, then delete the temp file — and warn the user the value may be in their shell history.

| Backend | Auth / health check | Store (stdin / file) | Path naming | Reference in code |
|---|---|---|---|---|
| HashiCorp Vault | `vault token lookup` | `printf %s "$V" \| vault kv put secret/<app>/<key> value=-` | `secret/<app>/<key>` | `vault kv get -field=value secret/<app>/<key>` |
| AWS Secrets Manager | `aws sts get-caller-identity` | create: `aws secretsmanager create-secret --name <app>/<key> --secret-string file:///dev/stdin` · update: `aws secretsmanager put-secret-value --secret-id <app>/<key> --secret-string file:///dev/stdin` | `<app>/<key>` | `aws secretsmanager get-secret-value --secret-id <app>/<key> --query SecretString --output text` |
| GCP Secret Manager | `gcloud auth list` | create: `printf %s "$V" \| gcloud secrets create <key> --data-file=-` · new version: `printf %s "$V" \| gcloud secrets versions add <key> --data-file=-` | `<key>` (project-scoped) | `gcloud secrets versions access latest --secret=<key>` |
| Azure Key Vault | `az account show` | `az keyvault secret set --vault-name <vault> --name <key> --file <tmpfile>` (no stdin; `--value` is argv-only — **argv caution**, use `--file` + temp file) | `<key>` (in `<vault>`) | `az keyvault secret show --vault-name <vault> --name <key> --query value -o tsv` |
| Doppler | `doppler me` | `printf %s "$V" \| doppler secrets set <KEY>` | `<KEY>` (in the configured project/config) | `doppler run -- <cmd>` or `doppler secrets get <KEY> --plain` |
| 1Password | `op whoami` | pipe a JSON item template on stdin so the value stays off argv: `op item template get "API Credential" > t.json`, insert the value into `t.json`, then `op item create --vault <vault> --title <title> - < t.json`; delete `t.json` after. (The bare `field=<value>` assignment form is **argv caution** — `op` itself warns it is logged to shell history.) | `op://<vault>/<title>/credential` | `op read "op://<vault>/<title>/credential"` or `op run` |
| Infisical | `infisical user get` | `infisical secrets set <KEY>=<V>` (**argv caution** — value is an argv token; clear history afterward) | `<KEY>` (in the workspace/env) | `infisical run -- <cmd>` or `infisical secrets get <KEY> --plain` |

## Argv-caution backends

Azure Key Vault's simple form (`--value`), the 1Password `field=<value>` assignment form, and Infisical's `secrets set` put the value on the command line. For these:

1. Prefer the safer form shown above — Azure `--file`, 1Password's piped JSON template, and (for Infisical) clearing the history entry afterward.
2. If you must use the argv form, tell the user the value will be visible in `ps` and in shell history, and suggest clearing the relevant history entry afterward.

## Picking the backend

If exactly one of the seven CLIs is installed and authenticated, use it. If several are, ask the user which to target. If none are authenticated, stop and point the user at that backend's login flow — this skill targets an existing, reachable vault and does not provision one.
