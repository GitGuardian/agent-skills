# Remediation: Cloud Provider Keys

> Sibling reference to [`remediation-doctrine.md`](remediation-doctrine.md), loaded on demand
> for cloud-provider credential findings. Each entry fills the schema in
> [§ 9.0](remediation-doctrine.md#90-schema). Carries § 9.1 (AWS), § 9.8 (GCP), § 9.9 (Azure).

### 9.1 AWS access keys

**What it is.** An access-key-ID + secret-access-key pair issued to an IAM user (less commonly bound to an IAM role via STS). Authenticates AWS SDK / CLI / API calls against the IAM principal's attached policies.

**Revoke location.** AWS Console → IAM → Users → *username* → Security credentials → Access keys → set the leaked key to *Inactive*, then *Delete* once you've confirmed no consumer still uses it. CLI equivalent:

```bash
aws iam update-access-key --access-key-id AKIA... --status Inactive --user-name <user>
aws iam delete-access-key  --access-key-id AKIA... --user-name <user>
```

Always go *Inactive → confirm no breakage → Delete*. Deactivation is reversible for ~24h of consumer-discovery; deletion is not.

**Regenerate location.** Same page → *Create access key*. IAM users can hold two active access keys simultaneously, which is the overlap mechanism for graceful rotation. Strongly prefer short-lived STS credentials or IAM Identity Center for new workloads; if you're issuing a long-lived access key in 2026, flag the underlying pattern as itself a finding worth addressing.

**Common consumers.**

- `~/.aws/credentials` and `~/.aws/config` on developer / build machines
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, sometimes `AWS_SESSION_TOKEN`) on services, Lambda functions, ECS task definitions, EC2 user-data, Kubernetes secrets
- CI provider secrets (GitHub Actions secrets, GitLab CI variables, CircleCI contexts, Buildkite agent env)
- IaC files (Terraform `aws_iam_access_key` resources, Pulumi equivalents) — note that hardcoding keys in IaC is itself a finding
- Third-party SaaS integrations configured with the IAM user's keys (CI/CD, monitoring, backup vendors, data warehouses with S3 sources)
- AWS Secrets Manager / Parameter Store entries that wrap the access key (rare but happens)

**Dependency mapping for this type.**

1. Pull the **IAM credential report** to see when the key was last used and against which service:

   ```bash
   aws iam generate-credential-report
   aws iam get-credential-report --query Content --output text | base64 -d
   ```

2. Query **CloudTrail** for the access key ID over the relevant window. This produces the list of services and IPs that invoked the credential:

   ```bash
   aws cloudtrail lookup-events \
     --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIA... \
     --start-time <ISO8601> --end-time <ISO8601>
   ```

3. Grep the org's repos for the access key ID and the canonical env-var names:

   ```bash
   git grep -nE 'AKIA[0-9A-Z]{16}|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY'
   ```

4. List runtime consumers that may hold the key in environment configuration:

   ```bash
   # Lambda functions
   aws lambda list-functions --query 'Functions[].FunctionName' --output text \
     | tr '\t' '\n' \
     | while read -r fn; do aws lambda get-function-configuration --function-name "$fn" \
       --query 'Environment.Variables' --output json; done

   # ECS task definitions (current revisions only)
   aws ecs list-task-definitions --status ACTIVE --query 'taskDefinitionArns[]' --output text

   # EC2 instances with user-data that may template the key
   aws ec2 describe-instances --query 'Reservations[].Instances[].InstanceId'
   ```

5. Check each CI provider's secrets configuration (GitHub Actions `repo:variables`, GitLab CI variables, CircleCI context env, etc.).

6. Inventory third-party integrations in the AWS account by reviewing the IAM user's tags / description and any cross-account roles that wrap it.

Map consumers from steps 1–6 to owning teams. Each owner gets a wave in the rollout sequence. AWS access keys support overlap (two active per user), so the standard rollout is: create new key → distribute to consumers wave-by-wave with the old key still active → deactivate the old key for a soak window → delete.

**Post-rotation verification.**

- Confirm the old key is *Deleted* (not just *Inactive*) in the IAM console once the soak window passes.
- Issue a deliberate AWS API call using the old key and confirm `InvalidClientTokenId`:

  ```bash
  AWS_ACCESS_KEY_ID=AKIA... AWS_SECRET_ACCESS_KEY=... aws sts get-caller-identity
  # expect: An error occurred (InvalidClientTokenId) when calling the GetCallerIdentity operation
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Spot-check CloudTrail for `Failure` events using the old access key ID for 24–72h after the rotation completes — surfaces consumers that were missed in the dependency map.

Canonical AWS reference: <https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html>.

### 9.8 GCP service account JSON

**What it is.** A JSON key file containing a service account's private key, downloaded once from the GCP console at creation time. Authenticates against GCP APIs as the service account; carries whatever IAM bindings that account has been granted. Format: a JSON object with `type: "service_account"`, `project_id`, `private_key_id`, `private_key`, `client_email`, and friends.

> **Strong recommendation.** Prefer **Workload Identity Federation** (for GKE, GitHub Actions, GitLab, etc.) or short-lived OAuth tokens over downloaded JSON keys for new workloads. If this finding is the first time the JSON-key pattern is being scrutinized, surface the alternative as part of the remediation — the rotation is the right moment to migrate.

**Revoke location.** GCP Console → IAM & Admin → Service Accounts → click the service account → Keys tab → find the key by `key_id` (matches `private_key_id` in the JSON) → *Delete*. CLI equivalent:

```bash
# List keys for the service account
gcloud iam service-accounts keys list \
  --iam-account=<sa-email> \
  --project=<project-id>

# Delete the leaked key
gcloud iam service-accounts keys delete <key-id> \
  --iam-account=<sa-email> \
  --project=<project-id>
```

Deletion is immediate and irreversible. There is no "disable" intermediate state — deletion is the only revocation path.

**Regenerate location.** Same Keys tab → *Add Key* → *Create new key* → JSON. The new file downloads immediately. A service account can hold multiple active keys (up to 10), supporting overlap rollouts.

**Common consumers.**

- Environment variable `GOOGLE_APPLICATION_CREDENTIALS` set to a file path on the consuming machine / pod
- Mounted file paths in Kubernetes pods, Cloud Run services, App Engine deploys, CI runners
- Kubernetes secrets (the JSON pasted as a `Secret` and mounted into pods) — the leak vector is often the secret manifest checked into git
- CI provider secrets (GitHub Actions, GitLab CI) — base64-encoded JSON pasted into a secret variable
- Terraform / Pulumi state files when the GCP provider was configured with credentials inline
- Local developer machines authenticating gcloud-aware tools without `gcloud auth application-default login`

**Dependency mapping for this type.**

1. GCP audit logs filtered by the service account principal email surface caller identities and source IPs:

   ```bash
   gcloud logging read \
     "protoPayload.authenticationInfo.principalEmail=\"<sa-email>\"" \
     --project=<project-id> \
     --freshness=30d \
     --format=json \
     --limit=1000
   ```

   The `protoPayload.requestMetadata.callerIp` field gives the source IP per call.

2. Grep the org's repos for the service account email and the `private_key_id`:

   ```bash
   git grep -nE '<sa-email>|"private_key_id"|GOOGLE_APPLICATION_CREDENTIALS'
   ```

3. List Kubernetes secrets that may hold service account JSON:

   ```bash
   # Across all namespaces in a cluster
   kubectl get secrets --all-namespaces -o json \
     | jq -r '.items[] | select(.type == "Opaque") | .metadata.namespace + "/" + .metadata.name'
   ```

   Then `kubectl get secret <name> -o jsonpath='{.data}' | base64 -d` (cautiously) to verify which hold the leaked key.

4. Check CI secret stores for `GCP_SA_KEY` / `GOOGLE_CREDENTIALS` entries.
5. Inventory Cloud Run / App Engine / GKE workloads that may have been configured with the SA.

The 10-keys-per-SA limit supports overlap: create new key → distribute → confirm new key in audit logs → delete old.

**Post-rotation verification.**

- Authenticate deliberately with the old JSON and expect `401 invalid_grant`:

  ```bash
  GOOGLE_APPLICATION_CREDENTIALS=/path/to/old-key.json \
    gcloud auth application-default print-access-token
  # expect: ERROR: ... invalid_grant ... Account has been disabled / Key has been deleted
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch GCP audit logs for `permission_denied` events from the SA over the next 24–72h; surfaces consumers that were missed.
- Spot-check Kubernetes pods for `Failed to authenticate` errors in their stdout / stderr if the SA was used for pod-level auth.

Canonical GCP reference: <https://cloud.google.com/iam/docs/keys-create-delete>.

### 9.9 Azure connection strings

**What it is.** A connection string for an Azure resource with credentials embedded. Most common: a Storage account connection string of the form `DefaultEndpointsProtocol=https;AccountName=<acct>;AccountKey=<key>;EndpointSuffix=core.windows.net`. The same pattern recurs with variations for Service Bus, Event Hubs, Cosmos DB, Cache for Redis, and App Configuration — each uses its own resource-specific connection string format but shares the "two named keys for overlap" pattern that makes rotation tractable.

This worked example focuses on Storage; the variations are noted at the bottom.

**Revoke location.** Azure Portal → Storage account → Security + networking → Access keys → click *Rotate key1* (or *Rotate key2*) depending on which key was in the leaked connection string. CLI equivalent:

```bash
az storage account keys renew \
  --account-name <acct> \
  --resource-group <rg> \
  --key key1   # or key2
```

Azure provides exactly two named keys (`key1` and `key2`); rotating one immediately invalidates that key and replaces it with a new value. The other key keeps working — this is the overlap mechanism.

**Regenerate location.** Same Access keys page. Rotation and regeneration are the same action in Azure's model.

**Common consumers.**

- App Service configuration / Function App application settings (env vars like `AzureWebJobsStorage`, `WEBSITE_CONTENTAZUREFILECONNECTIONSTRING`)
- AKS pods reading connection strings from Kubernetes secrets or Azure Key Vault
- .NET app config files (`appsettings.json`, `web.config` with `<connectionStrings>` sections) — these are a classic leak vector when checked into git
- Azure Functions bindings that reference connection strings by name
- Azure Data Factory / Synapse pipelines using the storage account as source or sink
- CI variables in Azure Pipelines, GitHub Actions, GitLab CI that hold the connection string for build artifacts
- Backup and DR tools (Azure Backup, third-party backup vendors) configured against the storage account
- BI / analytics tools (Power BI, Synapse) connected to storage data

**Dependency mapping for this type.**

1. Storage account → Insights → Failed requests / Errors and Metrics → break down by *Authentication mechanism* / API operation. The portal also exposes diagnostic logs that include the access-key identifier per request when storage logging is enabled:

   ```bash
   # Enable diagnostic settings beforehand; once enabled, query via Kusto in Log Analytics
   az monitor log-analytics query \
     --workspace <workspace-id> \
     --analytics-query "StorageBlobLogs | where AuthenticationType == 'AccountKey' | summarize count() by CallerIpAddress, OperationName"
   ```

2. Grep the org's repos for the leaked storage account name, the canonical env-var names, and the connection-string prefix:

   ```bash
   git grep -nE 'DefaultEndpointsProtocol=https;AccountName=|AzureWebJobsStorage|<account-name>'
   ```

3. List App Services and Function Apps in the subscription and inspect their app settings:

   ```bash
   az webapp list --query '[].{name:name, rg:resourceGroup}' -o tsv \
     | while read name rg; do az webapp config appsettings list \
         --name "$name" --resource-group "$rg" --query "[?contains(value,'<account-name>')]" -o tsv; done
   ```

4. Inventory Kubernetes secrets in AKS clusters that may hold the connection string (`kubectl get secrets -A`).
5. Check Azure Key Vault entries that may wrap the storage key and the consumers that read from each vault.
6. Inventory Data Factory pipelines and linked services connected to the storage account.

The dual-key overlap pattern is the standard rollout: rotate `key1` first (the leaked one) → confirm consumers switched to `key2` (which had been less commonly used) → wait for the soak window → optionally rotate `key2` next as a defense-in-depth measure if you suspect it was also exposed.

**Post-rotation verification.**

- Attempt to authenticate with the old key in a connection string and expect failure:

  ```bash
  az storage blob list \
    --account-name <acct> \
    --account-key '<old-key>' \
    --container-name <some-container>
  # expect: AuthenticationFailed — Server failed to authenticate the request.
  ```

- Re-scan affected artifacts: `ggshield secret scan path <files> --json`.
- Watch Storage account diagnostic logs for `AuthenticationFailed` events for 24–72h; surfaces consumers that were missed.

**Variations for related Azure resources.**

- **Service Bus / Event Hubs** — *Shared access policies* live under the namespace; rotation path is *Primary key* / *Secondary key* on each policy. Same two-key overlap pattern.
- **Cosmos DB** — *Keys* tab on the account; *Read-write keys* and *Read-only keys* each have primary/secondary. Same overlap mechanism.
- **App Configuration** — *Access keys* on the store; primary/secondary per key type.
- **Cache for Redis** — *Access keys* in the portal; primary/secondary.

The doctrine flow is identical across these resources; substitute the resource type when applying. Canonical Azure Storage reference: <https://learn.microsoft.com/azure/storage/common/storage-account-keys-manage>.
