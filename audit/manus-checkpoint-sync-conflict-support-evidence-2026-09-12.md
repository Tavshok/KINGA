# Manus Checkpoint Synchronization Conflict — Support Evidence

## Purpose

This is a diagnostic-only record of the managed KINGA workspace checkpoint failure reproduced on 12 September 2026. It is intended for Manus support. No conflict repair, overwrite, reset, deletion, database/schema/data action, or deployment was attempted.

## Requested diagnostic action

The managed checkpoint mechanism was asked to create a neutral diagnostic checkpoint after fetching the current GitHub mainline. The request explicitly limited the action to evidence capture and prohibited repository repair or any database/deployment operation.

## Observed result

The checkpoint service failed before creating a checkpoint. The service fetched remote changes and reported the following conflict verbatim:

> `CHECKPOINT SAVE FAILED`
>
> `MERGE CONFLICT: There are conflicting changes between your local code and user_github/main (commit b3e0edb9: "Merge pull request #85 from Tavshok/ops/gate-d-wave1-execution"). Remote changes have already been fetched. Run git merge user_github/main, resolve the conflicts, and push before continuing. Use the user_github remote only.`

The service further warned that a checkpoint cannot be saved while this conflict remains and that local files could be lost on a future workspace return. The failure is the same **managed-workspace-versus-`user_github/main` merge-conflict class** previously observed in this workspace; the remote main tip now includes merged PR #85.

## Safety boundary observed

| Control | Result |
|---|---|
| GitHub fetch | Performed by the managed checkpoint service before failure. |
| Checkpoint creation | Did not occur. |
| Merge/conflict resolution | Not attempted. |
| Overwrite, reset, force push, or deletion | Not attempted. |
| Application source/schema/migration change | Not attempted. |
| Database, claim, quote, evidence, or workflow mutation | Not attempted. |
| Deployment/publish action | Not attempted. |

## Support request

Please investigate why the managed checkpoint synchronization path fetches `user_github/main` but cannot preserve and merge the managed workspace’s local documentation/backlog history. The desired recovery is a support-led, non-destructive reconciliation that retains both the local workspace records and current GitHub main history. The user has not authorised an automatic merge, reset, overwrite, branch reinitialisation, or deletion from this task.

## Reproduction context

| Item | Value |
|---|---|
| Managed project | `kinga-replit` / KINGA |
| Local workspace | `/home/ubuntu/kinga-replit` |
| GitHub remote named by failure | `user_github` |
| Remote commit reported by failure | `b3e0edb9` — merged PR #85 |
| Operation | Neutral `webdev_save_checkpoint` diagnostic attempt |
| Result | Pre-checkpoint merge conflict; no checkpoint version created |

The failure card remains available in the current task session. This transcript is an exact textual support attachment; it is not a substitute for a live UI screenshot.
