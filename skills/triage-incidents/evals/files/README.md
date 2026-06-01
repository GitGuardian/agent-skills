# Eval fixtures — triage-incidents

These evals exercise incident triage through the GitGuardian Developer MCP server, which
talks to a live workspace; they do not ship local secret-bearing fixtures the way
`scan-secrets` does. The prompts are evaluated on agent behavior (which tool family it
reaches for, ranking logic, write discipline), not on scanning a fixture tree.
