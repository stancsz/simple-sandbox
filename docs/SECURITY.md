# Security Protocol

## Overview
Security is a core pillar of the Simple CLI platform. This document outlines the protocols for secret management, process isolation, and secure runtime injection.

## Secret Management

We strictly adhere to the principle of least privilege and secure injection. Secrets (API keys, passwords, tokens) are **never** passed as command-line arguments.

### Mechanism
1.  **Storage:** Secrets are stored in a `.env.agent` file (gitignored) or injected via the environment of the parent process.
2.  **Manager:** The `SecretManager` MCP server (`src/mcp_servers/secret_manager/`) acts as the gatekeeper.
    - **Tool:** `get_secret` retrieves secrets securely.
    - **Tool:** `inject_secret` (runtime only) allows secure passing of temporary secrets.
3.  **Injection:** The Orchestrator (`src/mcp.ts`) automatically loads secrets from `.env.agent` and securely injects them into the environment variables of spawned child processes (Agents and MCP Servers).
    - **No Logging:** Values retrieved this way are explicitly excluded from logs.

### Usage
To add a new secret:
1.  Add it to `.env.agent`: `MY_SECRET=value`.
2.  The Orchestrator will automatically make it available to all sub-agents.
3.  Agents can access it via `process.env.MY_SECRET`.

## Sandboxing

(Future implementation details for containerized sandboxing can be added here.)

## Dependency Audits

Dependencies are regularly audited for security vulnerabilities.

### Audit Policy
- Node.js dependencies in the root project (`package.json`) and standalone applications (e.g., `scripts/dashboard/package.json`) are checked.
- We run `npm audit` and `npm outdated` to identify required updates.
- Critical and high-severity CVEs are addressed immediately via `npm audit fix` or manual major version upgrades.
- After every dependency update, the entire test suite (`npm test`) must be executed to ensure backward compatibility and prevent regressions.

### Recent Audits
* **March 16, 2026**: Conducted a comprehensive dependency audit.
  * `scripts/dashboard`: Upgraded Vite to v8, Vue to v3.5, and Chart.js to v4.5. Addressed critical vulnerabilities in `esbuild` by updating Vite.
  * Root Project: Addressed vulnerabilities in `vitest`, `stagehand` and other dependencies. Remaining moderate/low issues involving older dependencies were isolated or logged for future refactoring.
