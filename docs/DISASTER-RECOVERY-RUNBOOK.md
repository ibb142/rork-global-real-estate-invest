# IVX Disaster Recovery Runbook

## Purpose

This runbook provides step-by-step procedures for recovering from common
disaster scenarios affecting IVX Holdings production systems.

**Last updated:** 2026-07-12
**Owner:** Ivan Perez (iperez4242@gmail.com)
**Supabase:** https://kvclcdjmjghndxsngfzb.supabase.co
**Render:** srv-d7t9ivreo5us73ftose0
**API:** https://api.ivxholding.com
**Web:** https://ivxholding.com
**Chat:** https://chat.ivxholding.com

---

## Incident 1: Accidental Data Deletion

**DETECTION:** Data-loss detection alert (automated), or owner notices missing records.

**CONTAINMENT:**
1. Stop all autonomous systems: `POST /api/ivx/development-action { action: "halt" }`
2. Check what was deleted: `GET /api/ivx/data-vault/loss-detection`
3. Identify the affected table(s) and row counts.

**BACKUP_SELECTED:**
4. List available snapshots: `GET /api/ivx/data-vault/snapshots`
5. Select the most recent snapshot that predates the deletion.

**RESTORE_TARGET:**
6. Decide: full snapshot restore or table-specific restore.
7. For table-specific: identify which tables to restore.

**VALIDATION:**
8. Run a dry-run comparison: `GET /api/ivx/data-vault/snapshots/:id/tables/:table`
9. Verify the snapshot contains the deleted rows.

**OWNER_APPROVAL:**
10. Owner must authenticate and provide confirmation + reason.
11. `POST /api/ivx/data-vault/restore { snapshotId, confirmed: true, tables: [...] }`

**ROLLBACK:**
12. If restore makes things worse, use PITR (if enabled) to restore to a
    specific timestamp before the restore was run.

**COMMUNICATION:**
13. Log the incident in the audit trail.
14. Notify affected users if their data was temporarily unavailable.

---

## Incident 2: Bad Database Migration

**DETECTION:** Application errors after deployment, schema mismatch errors.

**CONTAINMENT:**
1. Rollback the deployment: `POST /api/ivx/developer-deploy/action { action: "rollback" }`
2. Stop the autonomous worker: `POST /api/ivx/agent-worker/run-once` (halt)

**BACKUP_SELECTED:**
3. Find the pre-deployment snapshot (automatically taken before migrations).
4. `GET /api/ivx/data-vault/snapshots` — look for snapshot timestamp before the migration.

**RESTORE_TARGET:**
5. Restore the affected tables from the pre-migration snapshot.
6. If schema was altered, use Supabase Dashboard to revert the migration.

**VALIDATION:**
7. Check row counts match pre-migration state.
8. Test critical API endpoints.

**OWNER_APPROVAL:**
9. Owner confirms the rollback is safe to execute.

**ROLLBACK:**
10. The pre-deployment snapshot IS the rollback.

**COMMUNICATION:**
11. Document the failed migration in the audit log.
12. Update the migration history.

---

## Incident 3: Compromised Credentials

**DETECTION:** Unusual API activity, unauthorized data access alerts, owner notices unfamiliar actions.

**CONTAINMENT:**
1. Immediately rotate the Supabase service role key.
2. Rotate the Render API key.
3. Revoke all active sessions: `POST /api/ivx/owner-access-repair`
4. Force all users to re-authenticate.

**BACKUP_SELECTED:**
5. Take an immediate snapshot: `POST /api/ivx/data-vault/snapshot`
6. This captures the current state before any cleanup.

**RESTORE_TARGET:**
7. If data was modified by the compromised credentials, restore from the
    last known-good snapshot.
8. Use PITR (if enabled) to restore to a timestamp before the compromise.

**VALIDATION:**
9. Audit all recent changes: `GET /api/ivx/restore-center/guard-audit`
10. Check for unauthorized destructive operations.
11. Verify all wallet balances reconcile.

**OWNER_APPROVAL:**
12. Owner must manually re-authenticate with new credentials.

**ROLLBACK:**
13. Restore from snapshot if data was modified.
14. Re-enable services only after all credentials are rotated.

**COMMUNICATION:**
15. Notify all users that a security incident occurred.
16. File an incident report.

---

## Incident 4: Corrupted Database

**DETECTION:** SQL errors, data integrity check failures, application crashes.

**CONTAINMENT:**
1. Stop all writes to the database.
2. Put the API in read-only mode.

**BACKUP_SELECTED:**
3. Use the most recent vault snapshot.
4. If available, use PITR to restore to a point before corruption.

**RESTORE_TARGET:**
5. Restore to a new Supabase project (isolated recovery environment).
6. Verify the restore before cutting over production DNS.

**VALIDATION:**
7. Run the recovery drill: `POST /api/ivx/restore-center/drill`
8. Verify all critical tables have correct row counts.
9. Run financial reconciliation: `GET /api/ivx/financial-protection/audit`

**OWNER_APPROVAL:**
10. Owner confirms the restore is complete and valid.
11. Owner authorizes DNS cutover.

**ROLLBACK:**
12. If the restore is bad, fall back to an older snapshot or PITR point.

**COMMUNICATION:**
13. Notify users of planned downtime.
14. Update status page.

---

## Incident 5: Supabase Outage

**DETECTION:** API errors, health check failures, Supabase status page.

**CONTAINMENT:**
1. Switch the API to degraded mode (serve from cache where possible).
2. Stop all database-dependent background jobs.

**BACKUP_SELECTED:**
3. The file-based Data Vault on the backend disk is independent of Supabase.
4. All snapshots are safe and accessible.

**RESTORE_TARGET:**
5. Wait for Supabase to recover (check status.supabase.com).
6. If Supabase is down for extended period, consider restoring to a new project.

**VALIDATION:**
7. Once Supabase is back, run data-loss detection.
8. Compare live data vs latest vault snapshot.

**OWNER_APPROVAL:**
9. If data was lost during the outage, owner approves restore from vault.

**ROLLBACK:**
10. Restore from vault snapshot if data is missing.

**COMMUNICATION:**
11. Notify users of the outage.
12. Monitor Supabase status page.

---

## Incident 6: Render Outage

**DETECTION:** API health check fails, Render status page.

**CONTAINMENT:**
1. Check Render status: https://status.render.com
2. If the service is suspended, check billing status.

**BACKUP_SELECTED:**
3. Supabase data is independent of Render — data is safe.
4. The backend disk vault is on Render, but snapshots are also in the git repo.

**RESTORE_TARGET:**
5. Deploy to an alternative hosting provider if Render is down for extended period.
6. Use the GitHub repo to deploy to a new provider.

**VALIDATION:**
7. Verify the new deployment can reach Supabase.
8. Run health checks.

**OWNER_APPROVAL:**
9. Owner authorizes DNS cutover to the new hosting provider.

**ROLLBACK:**
10. Once Render is back, redeploy and switch DNS back.

**COMMUNICATION:**
11. Notify users of the outage.
12. Update DNS records as needed.

---

## Incident 7: Region Outage

**DETECTION:** Both Supabase and Render are unreachable from users.

**CONTAINMENT:**
1. Verify it's a region issue (check cloud status pages).
2. Activate the disaster recovery plan.

**BACKUP_SELECTED:**
3. Use off-site backups (if configured on separate AWS S3).
4. Use vault snapshots from the git repo.

**RESTORE_TARGET:**
5. Deploy to a different region.
6. Restore database to a new Supabase project in a different region.

**VALIDATION:**
7. Verify all services are operational in the new region.
8. Run full validation suite.

**OWNER_APPROVAL:**
9. Owner authorizes the region cutover.

**ROLLBACK:**
10. Once the original region is back, migrate back if desired.

**COMMUNICATION:**
11. Notify all users of the region migration.
12. Update DNS to point to the new region.

---

## Incident 8: Storage Deletion

**DETECTION:** Missing images/videos, 404 errors on media URLs, storage audit alert.

**CONTAINMENT:**
1. Stop any processes that might be deleting storage objects.
2. Check storage bucket policies.

**BACKUP_SELECTED:**
3. Check storage manifest: `GET /api/ivx/storage/audit`
4. If off-site copies exist, use those for restore.

**RESTORE_TARGET:**
5. Re-upload missing objects from the off-site backup.
6. If no off-site copy, check if Supabase has object versioning enabled.

**VALIDATION:**
7. Verify all media URLs are working.
8. Compare object counts vs manifest.

**OWNER_APPROVAL:**
9. Owner confirms the restore is complete.

**ROLLBACK:**
10. If wrong objects were restored, revert.

**COMMUNICATION:**
11. Notify users if their media was temporarily unavailable.

---

## Incident 9: Ransomware / Hostile Mutation

**DETECTION:** Data appears encrypted/garbled, unauthorized schema changes, mass data modification.

**CONTAINMENT:**
1. Immediately revoke all credentials.
2. Isolate the backend from Supabase.
3. Stop all autonomous systems.

**BACKUP_SELECTED:**
4. Use the file-based Data Vault (independent of Supabase).
5. Use immutable backup copies if available.
6. Use PITR to restore to a point before the attack.

**RESTORE_TARGET:**
7. Restore to a NEW Supabase project (do not restore into the compromised one).
8. Deploy fresh backend infrastructure with new credentials.

**VALIDATION:**
9. Run full recovery drill.
10. Audit all data for unauthorized changes.
11. Run financial reconciliation.

**OWNER_APPROVAL:**
12. Owner authorizes the full recovery plan.
13. Two-person approval required for production cutover.

**ROLLBACK:**
14. If the restore is bad, use an older snapshot.

**COMMUNICATION:**
15. Notify all users and regulatory authorities if required.
16. File an incident report with law enforcement.

---

## Incident 10: Wrong-Project Deployment

**DETECTION:** Data appears different than expected, unfamiliar tables or records.

**CONTAINMENT:**
1. Immediately stop the deployment.
2. Verify which Supabase project the backend is connected to.
3. Check environment variables: `EXPO_PUBLIC_SUPABASE_URL`

**BACKUP_SELECTED:**
4. Take a snapshot of the WRONG project (to document what happened).
5. Take a snapshot of the CORRECT project.

**RESTORE_TARGET:**
6. Fix the environment variables to point to the correct project.
7. Redeploy.

**VALIDATION:**
8. Verify the backend is now connected to the correct Supabase project.
9. Check row counts match expectations.

**OWNER_APPROVAL:**
10. Owner confirms the correct project is now active.

**ROLLBACK:**
11. If data was written to the wrong project, restore that project from its
    pre-incident state.

**COMMUNICATION:**
12. Document the incident.
13. Add safeguards to prevent wrong-project deployment in the future.

---

## Pre-Deployment Backup Protocol

Before EVERY production deployment, database migration, or schema change:

1. **Automatic snapshot** is taken by the data vault.
2. **GitHub SHA** is recorded in the snapshot metadata.
3. **Render deploy ID** is recorded.
4. **Rollback plan** is documented.

If the pre-deployment backup fails, the deployment is BLOCKED.

## Recovery Contact Information

- **Owner:** Ivan Perez — iperez4242@gmail.com
- **Supabase Dashboard:** https://supabase.com/dashboard/project/kvclcdjmjghndxsngfzb
- **Render Dashboard:** https://dashboard.render.com/web/srv-d7t9ivreo5us73ftose0
- **GitHub Repo:** https://github.com/ibb142/rork-global-real-estate-invest

## Recovery Service Endpoints

All endpoints require owner JWT authentication.

### Data Vault
- `GET /api/ivx/data-vault/status`
- `POST /api/ivx/data-vault/snapshot`
- `GET /api/ivx/data-vault/snapshots`
- `POST /api/ivx/data-vault/restore`
- `GET /api/ivx/data-vault/loss-detection`

### Restore Center
- `GET /api/ivx/restore-center/overview`
- `POST /api/ivx/restore-center/drill`
- `GET /api/ivx/restore-center/report`

### Monitoring
- `GET /api/ivx/recovery/monitoring`
- `GET /api/ivx/recovery/alerts`
- `GET /api/ivx/recovery/objectives`

### Financial Protection
- `GET /api/ivx/financial-protection/audit`

### Storage Backup
- `GET /api/ivx/storage/audit`
