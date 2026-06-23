# Remediation: Database URLs, Keys & Passwords

> Sibling reference to [`remediation-doctrine.md`](remediation-doctrine.md), loaded on demand
> for database-connection-string, key, signing-secret, and password findings. Each entry fills
> the schema in [§ 9.0](remediation-doctrine.md#90-schema). Carries § 9.4 (database connection
> URLs), § 9.5 (private keys: RSA / EC / SSH), § 9.11 (symmetric signing / shared secrets), and
> § 9.12 (vendorless passwords).

### 9.4 Database connection URLs

**What it is.** A connection string carrying credentials for a database — PostgreSQL (`postgres://user:pass@host:5432/db`), MySQL (`mysql://…`), MongoDB (`mongodb+srv://…`), Redis (`redis://default:pass@…`), or vendor-specific managed variants (Snowflake account URLs, Cloud SQL connection names with embedded passwords). The leaked secret is typically the password embedded in the URL; the host / port / database name are usually not sensitive on their own but compound the exposure.

**Revoke location.** On the database itself, not in a console. SQL approach for the major engines:

```sql
-- PostgreSQL: rotate the role's password
ALTER USER app_service WITH PASSWORD '<new-strong-password>';

-- MySQL
ALTER USER 'app_service'@'%' IDENTIFIED BY '<new-strong-password>';
FLUSH PRIVILEGES;

-- MongoDB (run on the admin database against the appropriate auth source)
db.changeUserPassword("app_service", "<new-strong-password>")

-- Redis (in the relevant ACL config or via CLI)
ACL SETUSER app_service ON '>NEW_PASSWORD' ~* +@all
```

For managed services the rotation also has a console path: AWS RDS → Modify → master password; Cloud SQL → User → Change password; MongoDB Atlas → Database Access → user → Edit; Redis Enterprise / Upstash dashboards each have an equivalent. Use the console path when the database admin user is the leaked one — you may not have a separate admin to run SQL with.

**Regenerate location.** Same path — `ALTER USER`-style commands set the new password; the *value* is what the agent surfaces back to consumers.

**Overlap support varies** and determines the rollout shape:

- **No overlap (single password per role):** the moment you rotate, every consumer with the old password loses its connection. Requires coordinated cutover or a maintenance window.
- **With overlap (two roles, same grants):** create a *new role* (e.g., `app_service_v2`) with identical grants, distribute its credentials, then drop or revoke the old role once consumers have moved. The DB engine treats them as distinct principals; old / new can coexist.

Always prefer the overlap pattern in production. The "rotate the password in place" approach is a coordinated cut at a specific moment, and missed consumers fail until manually fixed.

**Common consumers.**

- App config in env vars (`DATABASE_URL`, `POSTGRES_URL`, `MONGO_URI`) on every service that talks to the database
- ORM config files (Rails `database.yml`, Django `settings.py`, Sequelize / Prisma config) — distinguish leaked passwords in *committed* files vs env-var references
- Connection-pool sidecars: pgbouncer, ProxySQL, AWS RDS Proxy, MongoDB Atlas proxy — each holds its own copy
- Background-job / scheduler configs (Sidekiq, Celery, Airflow, cron-driven backups)
- BI / dashboarding tools (Metabase, Tableau, Looker) that hold long-lived DB credentials for the warehouse
- Read-only consumers and replicas often hold their own connection strings (analytics replicas, ETL pipelines)
- Backup jobs (logical dumps, replication processes) that authenticate as a separate role

**Dependency mapping for this type.**

1. Query the database's live session table to identify connected clients:

   ```sql
   -- PostgreSQL
   SELECT pid, usename, application_name, client_addr, state, backend_start
   FROM pg_stat_activity
   WHERE usename = 'app_service';

   -- MySQL
   SHOW PROCESSLIST;
   -- Or for richer detail:
   SELECT user, host, db, command, state FROM information_schema.processlist
   WHERE user = 'app_service';

   -- MongoDB
   db.currentOp({ "appName": { $exists: true } })
   ```

   `application_name` and `client_addr` give you a starting point for which services and IPs are still connected as the leaked role.

2. Pull recent connection history if your database engine logs it: PostgreSQL `pg_stat_database`, RDS Performance Insights, Cloud SQL logs, Atlas database access history.

3. Grep the org's repos for the leaked connection string fragments (host + db, prefix) and for the canonical env-var names:

   ```bash
   git grep -nE 'DATABASE_URL|POSTGRES_URL|MYSQL_URL|MONGO_URI|REDIS_URL'
   ```

4. Check the connection-pool configs (pgbouncer's `userlist.txt`, ProxySQL's `mysql_users` table) for the role's password.

5. Inventory BI tool connections — these are often missed because the BI team is separate from the engineering org.

6. List replicas and downstream consumers (read replicas, analytics warehouses, change-data-capture sinks).

Map consumers to teams. Sequence the rollout per [§ 10](remediation-doctrine.md#10-generic-coordination-framework) step 5; overlap pattern is strongly preferred for production.

**Post-rotation verification.**

- Issue a deliberate connection attempt with the old credentials and expect authentication failure:

  ```bash
  # PostgreSQL
  PGPASSWORD='<old-password>' psql -h <host> -U app_service -d <db> -c 'SELECT 1'
  # expect: psql: error: FATAL: password authentication failed for user "app_service"

  # MySQL
  mysql -h <host> -u app_service -p'<old-password>' -e 'SELECT 1'
  # expect: ERROR 1045 (28000): Access denied for user 'app_service'@'...'
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch the DB's auth-failure log for the leaked role for 24–72h; surfaces consumers that were missed in the dependency map.
- If you took the *new-role* overlap path, drop or revoke the old role only after the auth-failure log is silent and `pg_stat_activity` shows no connections.

### 9.5 Private keys (RSA / EC / SSH)

**What it is.** An asymmetric key whose *private* half has leaked. Three common subtypes share most of the playbook but differ in where the public half is registered:

- **SSH user / deploy keys** — public half in a server's `~/.ssh/authorized_keys` or in a Git host's deploy-keys list.
- **SSH host keys** — public half in client `~/.ssh/known_hosts` entries; leaks here enable man-in-the-middle attacks against future connections.
- **Application keys** — signing keys (JWT / token-signing / package-signing) or TLS private keys. Public half is in the relying party's trust store (JWKS endpoint, pinned cert list, OS cert store).

**Revoke ≠ regenerate for keys.** Critically, you can't "revoke" a private key by destroying it — anyone who has the leaked copy still has it. Revocation requires updating *every consumer of the public half* to stop trusting it. This is fundamentally different from password / token rotation.

**Revoke location.** Wherever the public half is registered:

- **SSH user/deploy keys** — remove the public-key entry from the server's `~/.ssh/authorized_keys` (every server that trusts it) or from the Git host's deploy-keys settings. For GitHub: Settings → SSH and GPG keys → Delete.
- **SSH host keys** — clients must remove the stale `known_hosts` entry; if the host key was rotated on the server, clients also re-pin to the new fingerprint on next connection (after verifying out-of-band).
- **JWT / token-signing keys** — remove the public key from the JWKS endpoint or rotate the `kid` so verifiers reject tokens signed by the old key.
- **TLS private keys** — request revocation of the corresponding certificate from the issuing CA (and consider it issued-but-unrevoked until OCSP / CRL propagates, which can take hours).
- **Code-signing / package-signing keys** — remove from the relying party's trust store, push key-rollover packages to update-distributing infrastructure, and if the key was published in a CRL, ensure clients honor the CRL.

**Regenerate location.** Generate a new keypair locally (`ssh-keygen -t ed25519 -f new_key`, `openssl genpkey ...`, language-specific JWT libraries for app keys). The private half stays on the machine that needs to sign; the public half is the artifact you distribute.

**Common consumers.**

- `~/.ssh/authorized_keys` files on every server the key was authorized for (potentially many)
- Git host deploy-keys settings (GitHub, GitLab, Bitbucket — per-repo or per-org)
- CI runners with SSH access to deploy targets (deploy keys on runners)
- JWKS endpoints (typically published at `/.well-known/jwks.json` on the issuer; verifiers cache these)
- TLS termination configs (load balancers, ingress controllers, nginx / Envoy / HAProxy configs) — the private key lives in a file referenced by the config
- Pinned-certificate lists in mobile apps, embedded systems, or any client that does TLS pinning
- Package manager trust stores (apt repository signing keys, container image signing roots like cosign / Sigstore)
- Configuration management secret stores (Ansible Vault, Chef encrypted data bags) where the key was templated

**Dependency mapping for this type.**

1. Compute the key's fingerprint and use it as the search key:

   ```bash
   ssh-keygen -lf <public-key-file>
   # SHA256:abc123... user@host
   openssl pkey -in <private-key-file> -pubout -outform DER | sha256sum
   ```

2. SSH user/deploy keys: scan the org's `authorized_keys` files. If servers are managed by configuration management, the search is across the config repo:

   ```bash
   # Across an Ansible / Chef repo
   grep -rE 'ssh-(rsa|ed25519|ecdsa)' .
   # Filter for the specific public key
   grep -rF "$(awk '{print $2}' <public-key-file>)" .
   ```

3. Git host deploy keys: list via API (example: GitHub):

   ```bash
   for repo in $(gh repo list <org> --json nameWithOwner --jq '.[].nameWithOwner'); do
     gh api "/repos/$repo/keys" --jq ".[].title"
   done
   ```

4. JWT / token-signing keys: identify the JWKS endpoint, list all `kid`s currently published, and identify which verifiers consume it.
5. TLS keys: inventory the load balancer / ingress / TLS-terminating proxy configs and any backup systems that include the keystore in disk snapshots.
6. Code-signing keys: ask the team that publishes the signed artifact (the relying parties are wherever the artifact gets consumed — could be globally distributed; this is often a coordination project, not a query).

The dependency map for keys is usually *wider* than for passwords because the public half can be distributed independently of any usage signal. Plan for under-discovery; expect to find consumers post-rotation through breakage.

**Post-rotation verification.**

- Attempt to use the old private key for its purpose and expect failure:

  ```bash
  # SSH key
  ssh -i <old-private-key> -o StrictHostKeyChecking=no <user>@<host>
  # expect: Permission denied (publickey)

  # JWT signing key
  # Sign a test JWT with the old key, present it to the verifier — expect 401 / invalid signature.
  ```

- If the key was published in a Certificate Revocation List, verify the CRL has propagated (`openssl crl -in <crl> -noout -text`) or check OCSP status (`openssl ocsp …`).
- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- For SSH keys, watch the `auth.log` (Linux) / `secure` (RHEL) / SSH audit logs on the previously-trusting servers for failed authentication attempts with the old key — surfaces consumers that were missed.

### 9.11 Symmetric signing / shared secrets

**What it is.** A single secret value used to *both* produce and verify a signature or MAC — there is no public half. Examples: an HS256 JWT signing secret, a webhook-signing secret (Stripe `whsec_`, GitHub webhook secret, Slack signing secret), an HMAC request-signing secret, and framework session/CSRF secrets that sign cookies (Rails `secret_key_base`, Django / Flask `SECRET_KEY`, ASP.NET Data Protection keys). Unlike an asymmetric key ([§ 9.5](#95-private-keys-rsa--ec--ssh)), every verifier holds the *same* secret the signer holds, so a leak compromises signing and verification at once.

**The availability cliff.** Rotating a symmetric signing secret invalidates *every artifact ever signed with it, simultaneously* — all live sessions log out, all unexpired JWTs fail verification, all signed cookies are rejected, in-flight webhook deliveries fail their signature check. This is the defining difference from API-key rotation, where only future calls are affected. Plan for the cliff: either accept the mass-invalidation at a chosen low-traffic moment, or run a **dual-secret verification window** where the framework supports it (verify against {new, old}, sign only with new) for a soak period, then drop the old.

**Revoke location.** Usually *no vendor console* — the secret is an application config value, so "revoking" means generating a new value and deploying it to the signer plus every verifier. The exception is webhook-signing secrets, whose value the provider's dashboard does hold (Stripe Dashboard → Developers → Webhooks → roll signing secret; GitHub repo/org → Settings → Webhooks → edit secret); roll there and update the receiver in lockstep.

**Regenerate location.** Generate a new high-entropy value locally and place it in the secret store the app reads from — never back into the file that leaked:

```bash
openssl rand -base64 48        # generic signing secret
# Rails:  bin/rails secret
# Django: python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'
```

If the framework supports a *keyring* (Rails `secret_key_base` rotations, ASP.NET key ring, a JWT verifier configured with a key set), add the new secret as primary while keeping the old as a still-accepted verifier — that is the overlap mechanism. Without it, rotation is a hard cut.

**Common consumers.**

- Env vars / secret-store entries read at boot by every replica of the signing service *and* every independent verifier (`JWT_SECRET`, `SECRET_KEY_BASE`, `SECRET_KEY`, `*_SIGNING_SECRET`)
- Webhook *receivers* that verify provider signatures — each holds its own copy of the shared secret
- Sibling services that independently verify the same JWTs (an API gateway plus several microservices all configured with one `JWT_SECRET`)
- Mobile / SPA clients only if the secret was wrongly shipped client-side — if so, treat as burned and unrecoverable on already-distributed builds
- CI/CD and test fixtures that sign tokens for integration tests

**Dependency mapping for this type.**

This is [§ 10](remediation-doctrine.md#10-generic-coordination-framework) steps 2–3, with the twist that *verifiers*, not just callers, are consumers:

1. Grep the org's repos for the canonical config names and any inline value:

   ```bash
   git grep -nE 'JWT_SECRET|SECRET_KEY_BASE|SECRET_KEY|SIGNING_SECRET|whsec_|HMAC'
   ```

2. Enumerate every service configured with this secret — both signers and verifiers. A shared `JWT_SECRET` distributed to N services is N consumers that must cut over together.
3. For webhook-signing secrets, identify the *provider* (who signs) and the *receiver* (who verifies); rotation is a two-party coordination, and the provider's roll UI usually drives the timing.
4. Determine framework keyring support (does it accept a *set* of valid secrets?). This single answer decides hard-cut vs. overlap-window.
5. Size the cliff: how many live sessions / unexpired tokens does invalidation drop? That decides maintenance-window vs. soak-window.

**Post-rotation verification.**

- Sign a test artifact with the *old* secret, present it to a verifier, and confirm rejection:

  ```bash
  # JWT HS256: forge a token with the old secret, call a protected endpoint — expect 401 / invalid signature
  # Webhook: replay a payload signed with the old secret — expect signature-verification failure
  ```

- Confirm a *new*-secret-signed artifact verifies end-to-end across every verifier service.
- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch auth-failure / signature-rejection logs through the soak window; a spike of *legitimate-user* signature failures means a verifier never picked up the new secret (or the old one was dropped before the window closed).

### 9.12 Vendorless passwords

**What it is.** A password or high-entropy credential with *no issuing vendor and no management console* — a Linux / service-account password, an LDAP / Active Directory bind password, an SMTP / IMAP password, a basic-auth credential in an `.htpasswd` or reverse-proxy config, a message-broker password (RabbitMQ, Kafka SASL), an internal admin-panel login. The distinguishing trait is the *absence of a control plane*: no "API keys" page, no per-key "last used" telemetry, often no programmatic revoke — which makes the [§ 10](remediation-doctrine.md#10-generic-coordination-framework) dependency-mapping step the hardest of any credential type.

**Revoke location.** Wherever the password is *set*, which is system-specific:

```bash
# Local / service account on a host
passwd <service-account>            # or: usermod / chpasswd
# LDAP / Active Directory
ldappasswd -x -D <admin-dn> -W -S "uid=<svc>,ou=...,dc=..."
# .htpasswd (basic auth)
htpasswd -B /etc/nginx/.htpasswd <user>
# RabbitMQ
rabbitmqctl change_password <user> <new-password>
```

There is rarely a "deactivate without changing" state — setting a new password *is* the revoke. If the account itself is disposable, disabling or deleting it is cleaner than rotating its password.

**Regenerate location.** The same command sets the new value. Generate it with `openssl rand -base64 32` (or a password manager) and store it in the secret manager the consumers read from — never re-embed it in the file that leaked.

**Common consumers.**

- App config / env vars on every service that authenticates with the account (`SMTP_PASSWORD`, `BROKER_PASSWORD`, `LDAP_BIND_PASSWORD`)
- Reverse-proxy / web-server configs (`.htpasswd`, nginx `auth_basic_user_file`)
- Cron jobs, backup scripts, and systemd unit `Environment=` lines
- `.netrc`, `.pgpass`, and similar operator dotfiles
- Human users — a shared-account password may live in people's heads, password managers, or a wiki; these "consumers" cannot be enumerated by grep

**Dependency mapping for this type.**

The weakest-signal case. There is no usage telemetry to lean on, so lean on the systems that *do* log auth:

1. Grep repos and config-management for the account name and canonical env-var names:

   ```bash
   git grep -nE '<account-name>|SMTP_PASSWORD|BIND_PASSWORD|BROKER_PASSWORD'
   grep -rE '<account-name>' /etc /opt 2>/dev/null   # on the host(s)
   ```

2. Pull authentication logs from the system that owns the account to enumerate *who actually authenticates* — the only reliable consumer signal: `/var/log/auth.log` / `secure` (PAM), the LDAP/AD security event log, the mail server's SASL log, the broker's connection log. Source IPs map back to consuming services.
3. Ask the owning team and check the shared-secret wiki / password-manager vault entry — for human-shared accounts this is the *primary* discovery path, not a fallback.
4. Assume under-discovery. Plan a soak window before fully retiring the old credential where the account model lets old and new briefly coexist; many do not, in which case a maintenance window is required.

**Post-rotation verification.**

- Attempt authentication with the old password and expect failure:

  ```bash
  # SMTP
  curl -v --url 'smtps://<host>:465' --mail-from ... --user '<svc>:<old-password>'
  # expect: 535 Authentication failed
  # SSH / PAM service account
  sshpass -p '<old-password>' ssh <svc>@<host> true   # expect: Permission denied
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch the owning system's auth-failure log for the old credential for 24–72h; a failure from a legitimate service IP surfaces a consumer that was missed.
