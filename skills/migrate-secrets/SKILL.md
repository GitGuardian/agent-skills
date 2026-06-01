---
name: migrate-secrets
description: Move plaintext secrets out of files and code into your existing secrets manager — HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, Doppler, 1Password, or Infisical — then replace the hardcoded value with a reference. Use when centralizing secrets from a .env or config, or after a scan surfaces hardcoded credentials you want vaulted.
metadata:
  version: "0.1.7" # x-release-please-version
---

# Migrate Secrets to a Secrets Manager

## Overview

This skill moves plaintext secrets out of files and code into an **existing**, already-authenticated secrets manager, then replaces each hardcoded literal with a reference back to the vault. It is tool-agnostic: the same flow drives HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, Doppler, 1Password, and Infisical through their CLIs (see **Backends**).

The skill is deliberately mechanical. It performs the move and warns loudly when a value looks already-leaked — but it does **not** rotate, and it does **not** provision a vault. Rotation is owned by the `scan-secrets` remediation doctrine; this skill is the "store the value and update the caller" tail of that lifecycle, and it is equally usable on its own for routine hygiene (getting secrets out of a `.env` before they ever leak).

## When to Use

- You have plaintext secrets in a `.env`, config file, or source and want them centralized in your secrets manager.
- A scan surfaced hardcoded credentials and you want them vaulted (rotate first if they have leaked — see the warning in the move flow).
- You are onboarding a repo to a secrets manager your team already runs.

Do **not** use this skill to:
- **Find** secrets — that is `scan-secrets`.
- **Rotate** a leaked secret — that is the `scan-secrets` remediation doctrine.
- **Provision** a new vault, or wire **runtime** secret-fetching into your app — both are out of scope.
