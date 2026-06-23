# Remediation: Database URLs & Private Keys

> Sibling reference to [`remediation-doctrine.md`](remediation-doctrine.md), loaded on demand
> for database-connection-string and private-key findings. Each entry fills the schema in
> [§ 9.0](remediation-doctrine.md#90-schema). Carries § 9.4 (database connection URLs) and
> § 9.5 (private keys: RSA / EC / SSH).

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
