# Remediation framework: maintainer notes

The two remediation skills carry separate decision frameworks for their detection contexts. Keep instructions useful to a capable model: decision rules, organizational requirements and completion evidence. Obtain provider mechanics from current primary documentation at use time.

## Reference map

| Per-skill file | Purpose | Loaded when |
|---|---|---|
| `references/remediation-doctrine.md` | Principles, four axes, four modes, profiles, exposure tracks, credential lifecycle, coordination, takedown, validation and company workflow | Before remediation advice |

Keep the abstract reasoning and orchestration structure. Remove provider recipes and repetition, not the decisions that help agents prioritize, choose deliverables and coordinate owners. §9 holds generic credential-lifecycle decisions rather than a per-secret-type appendix. `SKILL.md` supplies the tool contract and routes to the framework. `triage-workflow.md` covers MCP sequencing; `interpreting-results.md` covers scanner output. Avoid repeating the framework in those files.

## Rules to preserve

- Retain the four axes and four modes (Driver, Coordination, Escalation, Containment), with evidence-based priority and context-dependent execution. Validity informs urgency; it does not independently choose priority or mode.
- Keep implementation profiles, public/private/off-repo tracks, dependency and owner mapping, rollout/recovery constraints, assigned handoffs and completion evidence. Company workflows still define the top-level structure.
- Confirm exposure, ownership/revocation authority and impact before a plan. Ask missing facts together and wait. Assignment, console access, validity and source criticality do not supply missing authority or dependency information.
- Treat real secrets in any commit history, including unpushed commits, and every incident as exposed. This is conservative handling, not a claim of observed misuse. Only otherwise-unexposed, uncommitted changes avoid invalidation.
- Public exposure raises urgency; confirmed private exposure permits coordination. Neither substitutes for assessing privilege and production impact. Any public occurrence takes precedence; incident category and exposure are separate.
- At any relevant branch tip, remove hardcoding and use approved credential injection, then invalidate the exposed value. History-only findings still require runtime-use and revocation checks. Moving the same leaked value into a vault is insufficient; already-dead credentials need no artificial replacement.
- Preserve custom steps verbatim, ordered, with named actors and approvals. Add implementation details under their step and label additional requirements. Only `workflow.id` identifies an MCP custom workflow.
- Require old-access rejection, healthy replacement consumers when needed, cleanup checks, leak-window investigation and prevention evidence. Keep pending owner actions explicit. Preserve user-run HMSL and confirmation-gated dashboard writes.

The scan framework accommodates uncommitted/unexposed changes and ggshield custom messages. The incident framework is exposure-only, uses MCP custom workflows and requires verified closure. Review shared rules in both frameworks without forcing textual identity.

## Editing and validation

Do not add provider or secret-type catalogs, tutorials or exception runbooks to the instructions. Obtain missing implementation details from company guidance and current official documentation at use time. Keep specific credentials in evaluation scenarios to test whether the general framework transfers across services. Correct a failed outcome through a general decision or verification rule when needed; do not turn each failure into a new runtime section. Do not require a specific file layout or exact wording in behavior assertions.

Run `npm test`, `node scripts/check-skill-markdown.mjs` and the Agent Skills specification validator. Check local links and anchors, independently installed skill references, and complete source/Kiro parity.

Use the [per-skill evaluation workflow](evals.md#per-skill-workflow) to compare frozen baseline and candidate instructions against the same outcome assertions. Retain raw streams, source hashes and evidence-backed grades. Include absent-context triage, mixed-priority findings, mode selection, dependency coordination, custom actors/approvals, non-default branch tips, history-only runtime use, already-revoked credentials and the unpushed-commit policy. Test varied invalidation behavior and incomplete reference reads without adding matching sections to the framework.
