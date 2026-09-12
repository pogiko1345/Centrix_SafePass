# SafePass MongoDB Atlas backups

SafePass's Render backend connects to MongoDB Atlas through `MONGODB_URI`. The
backend does not create or store database backups. Configure and verify backups
in the Atlas project that owns the cluster in that connection string. Keep
Atlas credentials and downloaded snapshots out of this repository.

For the current SafePass Dedicated M10+ cluster, the Atlas **Cloud Backup**
toggle was reported On on 12 September 2026. A completed snapshot and its
retention policy have not yet been independently verified. Do not mark backup
setup complete until both appear in Atlas.

## Find the cluster tier

In Atlas, open **Database > Clusters** and check the tier of the cluster used by
SafePass. The backup procedure depends on that tier:

- **Flex:** Atlas automatically takes one snapshot daily, beginning about 24
  hours after cluster creation, and retains the latest eight. Open **Database >
  Backup > [cluster] > Snapshots** to confirm a completed snapshot exists. The
  schedule and retention cannot be customized.
- **Dedicated M10+:** Open the cluster's configuration and turn **Cloud Backup**
  on. Then open **Database > Backup > [cluster] > Backup Policy** to choose
  snapshot timing and retention. Save the policy and verify a completed snapshot
  under **Snapshots** after the scheduled time. This can incur Atlas charges.
- **Free M0:** Atlas cloud backups cannot be enabled. Use MongoDB Database
  Tools (`mongodump` and `mongorestore`) with a separate secure backup destination
  and scheduler, or move to a cluster tier with managed snapshots. Do not treat
  the running database, a dashboard log, or a copy stored in the same cluster as
  a backup.

## Verify recoverability

For the M10+ cluster, open **Database > Backup > [cluster] > Backup Policy** and
record the daily and weekly retention periods. Open **Snapshots** and confirm
that at least one snapshot has completed, with a recent timestamp and expiry.
Atlas may need to reach the next scheduled snapshot time after backup is turned
on; an enabled toggle alone is not proof that a restorable backup exists.
If there is no completed snapshot yet, an Atlas Project Owner can take an
on-demand snapshot of an M10+ cluster from the Snapshots page instead of waiting
for the next scheduled run. Wait for its status to become completed before
relying on it. On-demand snapshot storage can affect Atlas billing.

Restore a completed snapshot to a separate nonproduction cluster, then compare
representative SafePass records and indexes. Never use the live SafePass cluster
as the target of a restore test. Keep the restore test isolated from Render and
production credentials.

The Admin dashboard has no in-app backup button because a database connection
alone cannot configure an Atlas snapshot policy. Older app versions calling
`POST /api/admin/backup` receive HTTP 501 instead of a false success response.
