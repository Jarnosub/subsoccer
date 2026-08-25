# Subsoccer Security Audit Summary

**Audit date:** June 11, 2026  
**Scope:** Website, Supabase database policies and functions, Netlify functions,
device-management scripts, CI workflows, dependencies, and limited read-only
production validation.

## Executive Summary

The audit identified several serious authorization, data-exposure, and
application-security issues. The publicly visible Supabase key is normal for
this architecture and is not itself a vulnerability. Security depends on the
database access policies and server-side functions, several of which currently
grant more access than intended.

The highest-priority weaknesses could allow unauthorized users to:

- Access personal information.
- Promote themselves to administrator.
- Manipulate rankings, tournaments, registrations, and game ownership.
- Modify venue, table, payment, and QR-code records.
- Steal browser sessions through cross-site scripting.
- Bypass player-consent controls.
- Trigger paid AI services or send commands to connected arcade hardware.

Immediate remediation is recommended.

## Critical Findings

### 1. Public access to player information and legacy credential fields

The public database role can read complete player records, including email
addresses, phone numbers, administrator status, and a legacy password field.
Read-only production validation confirmed anonymous access to personal
information.

The legacy login flow also supports unsalted SHA-256 password hashes and a
plaintext fallback. No populated password values were found in the tested
production sample, but the exposed field and legacy processing remain unsafe.

**Risk:** Privacy exposure, account targeting, offline credential attacks, and
potential data-protection obligations.

**Recommendation:** Remove the legacy password field and processing, migrate
fully to Supabase Auth, and expose only a restricted public player profile with
non-sensitive fields.

### 2. Unauthorized administrator promotion

Authenticated users can update their own player record. The database trigger
intended to protect administrator and ranking fields uses an ineffective
authorization check inside a privileged function. It may therefore allow a
user to set their own administrator status or protected statistics.

**Risk:** Administrative account takeover and access to protected operations.

**Recommendation:** Permit updates only to explicitly approved profile fields.
Correct the database safeguard and enforce administrator authorization inside
every privileged function.

### 3. Public access to privileged database operations

Several database functions run with elevated privileges and are callable by
anonymous users without adequately validating the caller.

The match-recording function accepts arbitrary player IDs and results. Other
affected operations include tournament registration, bracket progression, and
game-ownership management.

**Risk:** Ranking fraud, tournament manipulation, unauthorized ownership
changes, and loss of database integrity.

**Recommendation:** Revoke anonymous execution privileges and add server-side
identity, ownership, role, and device checks to every privileged operation.

### 4. Cross-site scripting and session theft

User-controlled values are inserted directly into HTML in several areas. A
crafted login link can execute JavaScript in a visitor's browser. Team, event,
and other database-backed content creates additional stored cross-site
scripting paths.

Because browser sessions persist in local storage, successful exploitation
could expose an authenticated user's session.

**Risk:** Account takeover, administrator session theft, and persistent attacks
against shared or public displays.

**Recommendation:** Replace unsafe HTML rendering with text-safe DOM operations,
validate user input, sanitize any required rich content, and deploy a
restrictive Content Security Policy.

## High Findings

### 5. Excessive write access to operational and payment records

Database policies permit broader modification rights than intended:

- Authenticated users can update game and table records they do not own.
- QR-code and professional table-session records have public or overly broad
  write access.
- Payment records are publicly readable and ordinary authenticated users can
  insert records.

**Risk:** Venue configuration tampering, fraudulent payment or entitlement
records, inventory damage, and ranking manipulation.

**Recommendation:** Enforce owner-only access, restrict public reads to
necessary fields, and reserve payment writes for trusted server-side webhook
processing.

### 6. Ranking and verified-match controls can be bypassed

The match-recording function does not verify that the caller is one of the
players or an authorized table. It also treats caller-supplied tournament
identifiers and a special game identifier as sufficient to bypass the normal
rating cap.

**Risk:** Attackers can boost or reduce any player's rating and create
fraudulent verified matches.

**Recommendation:** Derive match verification from trusted server-side table,
tournament, and session records. Require authenticated participants or an
individually authenticated hardware device.

### 7. Player-consent and anti-cheat controls can be bypassed

Consent is transmitted through a public Realtime broadcast containing only a
player name. It is not cryptographically signed or validated by the
match-recording function. Production code also listens for a locally generated
`force-consent-granted` browser event.

**Risk:** Anyone able to access the page or channel can simulate consent and
record matches involving another player.

**Recommendation:** Remove the development bypass. Issue short-lived,
single-use server-side consent tokens bound to the authenticated player,
match, table, and expiry time, and validate them when recording the result.

### 8. Sensitive production backups stored in Git

Tracked database backups contain customer and operational information,
including identifiers, telemetry, table serial numbers, addresses, and
coordinates. An automated workflow continues committing database exports.

**Risk:** Long-term exposure through repository access and immutable Git
history.

**Recommendation:** Stop committing backups, move them to encrypted
access-controlled storage, define retention limits, remove sensitive Git
history, and review whether notification or regulatory action is required.

### 9. Unauthenticated AI avatar services

Avatar-generation endpoints can be called without authentication or rate
limits. One endpoint accepts large caller-provided image data and
caller-supplied storage destination information.

**Risk:** Unexpected OpenAI costs, resource exhaustion, and unauthorized file
uploads.

**Recommendation:** Require authenticated users, implement per-user quotas and
request-size limits, and use only server-controlled storage credentials and
destinations.

### 10. Public channels can control connected hardware

The arcade daemon listens for relay-control commands over public Realtime
channels. A person who discovers or guesses a table identifier may be able to
activate or interrupt connected equipment.

**Risk:** Unauthorized operation or disruption of physical arcade hardware.

**Recommendation:** Use private authenticated channels, authorize every
command, use unique device identities, and add device-side validation,
timeouts, and audit logging.

### 11. Device and Wi-Fi credentials committed to source control

Deployment scripts contain shared Raspberry Pi login credentials and a venue
Wi-Fi password. These credentials remain recoverable from Git history.

**Risk:** Unauthorized device and network access.

**Recommendation:** Rotate all exposed credentials immediately, use unique SSH
keys per device, disable password authentication, and remove the credentials
from repository history.

## Medium Findings

### 12. Legacy login query abuse and missing application rate limits

The custom username login performs fuzzy, wildcard database searches using
caller-controlled input. Login attempts are not rate-limited by the
application.

**Risk:** Database load, username discovery, and automated password guessing
against legacy accounts.

**Recommendation:** Remove the legacy login flow. Until then, escape wildcard
characters, limit result counts and input length, and add IP- and account-based
rate limiting.

### 13. Vulnerable dependencies

The dependency audit identified one critical, four high, and several moderate
vulnerabilities. Most affect development tooling, but a WebSocket vulnerability
also affects the arcade daemon runtime.

**Recommendation:** Upgrade affected packages, regenerate lock files, and add
automated dependency scanning to CI.

### 14. Missing browser and third-party script protections

The site has several useful security headers but no Content Security Policy.
Multiple third-party scripts are loaded without exact version pinning or
Subresource Integrity.

**Recommendation:** Add a restrictive Content Security Policy, pin dependency
versions, self-host critical assets where practical, and use Subresource
Integrity for remaining external scripts.

### 15. Account deletion does not require recent re-authentication

The account-deletion function correctly validates the user's access token, and
the interface asks for two confirmations. However, it does not require recent
password, MFA, or email re-authentication before permanently deleting the
account and history.

**Risk:** A stolen active session, including one obtained through the identified
XSS risks, could be used for irreversible account deletion.

**Recommendation:** Require a recent authentication event, MFA challenge, or
email confirmation before destructive account deletion.

### 16. Client-side password gates

Some demonstration or branded pages use passwords embedded in browser code.
These gates can be bypassed by anyone inspecting the page.

**Recommendation:** Treat these gates only as presentation features or replace
them with server-side authentication if the content is confidential.

### 17. CI and backup workflow hardening

The backup workflow has repository write permission, installs an unpinned
package at runtime, and commits database exports to the repository.

**Risk:** Increased software supply-chain exposure and continued publication of
sensitive backup data.

**Recommendation:** Remove database exports from Git, pin actions and
dependencies, and reduce workflow permissions to the minimum required.

## Lower-Priority Hardening

- Restrict cross-origin access where browser-based third-party calls are not
  required. CORS must not be treated as a replacement for authentication.
- Exclude logs, reports, and generated files that may contain sensitive data
  from source control.
- Remove obsolete browser headers after a Content Security Policy is deployed.
- Add security monitoring for repeated login attempts, privileged RPC calls,
  payment changes, and hardware commands.

## Existing Positive Controls

- Supabase Row Level Security is enabled, although several policies require
  correction.
- The account-deletion function validates the supplied access token.
- Rating calculations run in the database rather than relying on client-side
  ELO calculations.
- HTTPS enforcement and several useful browser security headers are configured.
- No production OpenAI secret was found committed in the reviewed source.
- A previously unrestricted destructive database operation appears to have
  been addressed.

## Recommended Remediation Order

1. Restrict player data and remove legacy password handling.
2. Prevent administrator promotion and revoke anonymous privileged functions.
3. Correct game, payment, QR-code, and session access policies.
4. Fix cross-site scripting and deploy a Content Security Policy.
5. Correct match authorization and replace client-side consent verification.
6. Stop repository backups and rotate device and Wi-Fi credentials.
7. Secure AI endpoints and hardware-control channels.
8. Add login protections, upgrade dependencies, and harden CI.
9. Add recent re-authentication for irreversible account deletion.

## Production Migration and Rollout Requirements

The production Supabase database is an existing stateful system containing live
customer and operational data. Remediation must therefore use controlled,
forward-only migrations. Production must **not** be dropped, reset, recreated,
or treated as a greenfield deployment. Replaying the full initial schema
against production could cause data loss, policy conflicts, or extended
service interruption.

Subsoccer already has a separate staging environment connected to the
`staging` branch. All security fixes, application changes, and database
migrations must be deployed and accepted there before production promotion.
The staging branch must use only staging Supabase, storage, Netlify, payment,
AI, Realtime, and hardware credentials. It must never run migrations against
the production database.

### Required rollout approach

1. **Inventory the actual production state.** Compare the live schema,
   functions, grants, triggers, policies, storage policies, and migration
   history with the repository. Do not assume every historical migration was
   applied exactly as committed.
2. **Prepare the staging database safely.** Bring the staging schema, functions,
   grants, triggers, policies, and storage configuration sufficiently close to
   production to exercise the migration accurately. Use sanitized representative
   data where test coverage depends on existing records. Production customer data
   must not be copied to staging without an approved sanitization process.
3. **Deploy through the `staging` branch first.** Commit each new migration and
   its compatible application changes to the `staging` branch. The staging
   deployment must apply the migration only to the staging Supabase project.
   Direct first-time execution of an untested migration against production is
   prohibited.
4. **Complete staging acceptance testing.** Test existing website,
   administration, account, payment, tournament, ranking, Realtime, storage, and
   hardware workflows in staging. Security tests must confirm that the reported
   exploit paths are blocked while legitimate workflows continue to work.
5. **Use a role-based verification matrix in staging.** Test anonymous, normal
   authenticated, owner, administrator, service-role, webhook, and hardware-device
   access. Confirm both that permitted operations work and that prohibited
   operations return authorization errors.
6. **Require promotion approval.** Record the migration version, staging test
   results, known limitations, rollback procedure, and responsible approver.
   Production promotion should occur only after staging acceptance is complete.
   The reviewed migration files promoted to production must be the same files
   tested in staging; do not rewrite them between environments.
7. **Create a protected production recovery point.** Immediately before
   production deployment, take a provider-managed database backup or
   point-in-time recovery snapshot and verify the recovery procedure. Sensitive
   backups must not be committed to Git.
8. **Use new incremental migration files.** Each fix should be delivered as a
   new reviewed migration containing only the required `ALTER`, `CREATE OR
   REPLACE`, `DROP POLICY`, `CREATE POLICY`, `REVOKE`, and `GRANT` operations.
   Historical migrations should not be edited and replayed as a production
   deployment mechanism.
9. **Make migrations repeatable where practical.** Use explicit object names,
   existence checks where appropriate, and precondition queries that stop the
   deployment if staging or production differs from the expected state.
10. **Apply expand-migrate-contract changes.** Add replacement columns, views,
   functions, and policies before removing old ones. Migrate or verify existing
   data, deploy compatible application code, and remove legacy fields only in a
   later migration after confirming they are no longer used.
11. **Sequence authorization changes carefully.** Deploy server-side functions and
   compatible application code before revoking old access where necessary.
   RLS, RPC, and grant changes should be applied in a short transaction and
   tested immediately to avoid either an access gap or accidentally locking out
   legitimate users.
12. **Deploy production during a controlled maintenance window.** Assign an owner for the
   migration, application deployment, validation, and rollback decision. Pause
   affected writes if a data transformation cannot be performed safely while
   traffic is active.
13. **Run production smoke tests and monitor the release.** Repeat the
    non-destructive role and workflow checks that are safe for production.
    Review database errors, authorization failures,
    RPC usage, login failures, payment changes, and hardware commands. Keep the
    release under active observation until normal traffic and workflows are
    confirmed.

### Rollback requirements

Every production migration must have a documented rollback or corrective
migration prepared before deployment. Policy, grant, trigger, and function
changes should normally be reversed through a new migration. Data-destructive
steps, such as deleting the legacy password column or purging records, must be
delayed until the replacement has been verified and the retention period has
passed.

Restoring the complete database from backup should be treated as an emergency
measure because it can discard legitimate writes made after the backup. A
failed security migration must never be handled by dropping and rebuilding the
production database.

## Validation Notes

Production validation was intentionally read-only. No accounts, database
records, payments, rankings, or physical devices were modified.

Automated browser tests passed. Most unit tests passed; the remaining failures
were caused by hardcoded developer-specific filesystem paths rather than
application behavior.

The findings distinguish between behavior verified through read-only production
requests and vulnerabilities confirmed from the deployed source and migration
chain. Privileged write operations were not executed during the audit.
