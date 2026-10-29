# Security Policy

## Supported versions

Only the current production deployment at [learnquiz.com](https://learnquiz.com) is supported with security updates. Older commits, forks and local deployments are not covered. Please verify that a vulnerability still affects the live site or the latest `main` branch before reporting it.

## Reporting a vulnerability

**Please do not open a public issue or pull request for a security problem.** A public report can put users at risk before a fix is available.

Report vulnerabilities privately through GitHub:

1. Go to the repository's [**Security** tab](https://github.com/cristianuibar/learnquiz/security).
2. Choose **Report a vulnerability** to open a [private security advisory](https://github.com/cristianuibar/learnquiz/security/advisories/new).
3. Fill in the details below. Only the maintainer can see the report until a fix is published.

Private vulnerability reporting is enabled for this repository, so the form above is the fastest way to reach the maintainer.

## What to include

A good report helps us reproduce and fix the problem quickly. Please include:

- **Affected area:** the URL, route, component or file where you found the problem.
- **Steps to reproduce:** exact steps, payloads or requests, in enough detail that we can trigger the same behaviour.
- **Impact:** what an attacker could achieve (for example, access another user's data, bypass sign-in, or execute script in a victim's browser).
- **Supporting detail:** relevant logs, screenshots or a short proof of concept, plus the browser or environment you used.
- Whether you believe the issue is already being exploited, if known.

## What to expect

- **Acknowledgement:** within 2 business days of the report.
- **Initial assessment:** within 5 business days, including whether the report is accepted and its severity.
- **Fix and disclosure:** we will work on a fix, let you verify it where practical, and coordinate public disclosure after the fix is deployed. Please keep the details private until then.
- If a report is declined, we will explain why.

We appreciate responsible disclosure and will credit reporters in the advisory unless you prefer to stay anonymous.

## Out of scope

- Reports that rely only on automated scanner output without a demonstrated impact.
- Missing security headers or best-practice suggestions with no exploitable effect.
- Denial-of-service through volumetric traffic alone.
- Vulnerabilities in third-party services that Learn Quiz links to but does not operate.
