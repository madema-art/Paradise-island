# Launching the playable GitHub version

GitHub is the source of truth for playable Paradise Island code. Claude Code, Codex, Cloud Claude, and other coding agents must commit and push completed changes before the owner tests them. The owner normally tests by manually opening `Open Paradise Island.bat`, not by testing uncommitted agent edits.

The single configuration file is `startup.config.json`:

```json
{"remote":"origin","branch":"integrate/new-castaway","port":5173}
```

`origin` is the existing Paradise Island GitHub remote. Change the playable branch in this configuration file, commit it, and push it. The launcher never blindly pulls a branch's upstream and never automatically commits or pushes developer work.

## Launch sequence

1. The batch file keeps a visible command window and invokes `startup.mjs` using Node.js. Missing Node stops startup; the old unverified file-only fallback is removed.
2. Check Git, configuration, branch, and all tracked/untracked changes. A per-worktree lock prevents two launchers updating/building simultaneously.
3. Fetch the explicitly configured remote branch, with terminal credential prompts disabled and a bounded timeout. Compare `HEAD` against that fetch's `FETCH_HEAD`, then recheck the checkout before changing anything.
4. Equal commits print “Paradise Island is up to date.” A clean branch behind GitHub fast-forwards using `git merge --ff-only`, with automatic stashing explicitly disabled. There are no merge commits, rebases, resets, forced checkouts, branch movements, or cleans. `--no-overwrite-ignore` also aborts if a future remote commit would overwrite an ignored local song or backup. After an update, reload the launcher from disk so newly downloaded startup logic/configuration is used before building.
5. Install dependencies when the recorded manifest/lockfile/Node version/platform changes, packages are missing, or this is the first verified launch. Use `npm ci --no-audit --no-fund` when the lockfile exists; otherwise use `npm install`. The current project has a lockfile. A changed/generated lockfile that dirties the checkout stops startup for developer review.
6. Rebuild with the existing `npm run build` when tracked `src/`, `assets/`, build script or dependency inputs change, no successful build stamp exists, a bundle is missing, or a bundle's contents differ from the last successful build. Docs-only commits do not rebuild. Refresh the ignored music playlist independently on every launch, preserving song discovery without recompiling the game.
7. Start the existing `node serve.mjs 5173`, wait for actual HTTP readiness, then open **http://localhost:5173/**. The server and notebook/music APIs remain in `serve.mjs`; no alternate server is introduced. LocalStorage save keys and the normal browser origin are unchanged.

The window prints checking, update, install/build, starting, and ready stages. A newly started server stays attached to that window: keep it open; Ctrl+C or closing it stops that server. A subsequent launch can reuse a server only when its `/api/startup` identity matches the checkout's real path, exact launched revision, and current server-source hash. An older server, manually started unidentified server, another checkout, or an unrelated application on port 5173 causes a visible stop. Close the old server window and relaunch; the launcher never kills an existing process automatically. Reusing the correct server opens the browser and closes the secondary launcher after a short delay.

## Protection and recovery

- **Any unignored local change blocks launch/update**, including source edits, untracked code, or edited live notebook files. User-added audio directly inside `music/` and generated timestamped notebook snapshots are ignored as local content (see below). This deliberately conservative policy still protects real source files that might not collide with today's update. Git-ignored generated output, installed dependencies, and `.paradise-startup/` do not block it. The notebook continues saving exactly as before; saved tracked notebook changes must be reviewed before the next automatic update. Nothing is automatically stashed, moved, deleted, or committed. Review `git status` and preserve/commit/push or relocate your own files deliberately; do not blanket-discard them.
- **Wrong branch or detached HEAD:** stop, name the required branch, and leave the checkout unchanged. Review local work before switching manually.
- **Local commits ahead of GitHub:** stop and ask the developer to push completed work. **Divergence:** stop for manual resolution. Neither situation is treated as up to date.
- **Git missing, missing remote branch, connection/authentication failure, remote unavailable or fetch failure:** stop with the Git error and no browser launch. There is deliberately no offline fallback, so the displayed version cannot be mistaken for a verified GitHub version.
- **Install/build failure:** invalidate the success stamp before attempting the command, print its output, and stop. A later launch retries; existing bundle files cannot disguise a failed build. The checked-out source can already be updated after a failed install/build, but it is not launched. No rollback discards work.
- **Server failure or readiness timeout:** stop without opening the browser. Only a newly spawned child that failed readiness is stopped; existing processes are left alone.
- **Interrupted launch:** the lock is removed on normal completion/errors. A hard crash can leave the lock path printed on the next launch. Review the recorded PID before manually removing a stale lock; do not remove it while another launcher is active.

Developer concurrency cannot be made transactional against arbitrary external edits. Do not edit/build/commit the playable checkout while its launcher is updating/building; use an isolated worktree and publish completed commits. The launcher rechecks branch, revision, and local changes around the update/build stages.

Build/install fingerprints live in ignored `.paradise-startup/state.json`. They describe verified inputs and output hashes, not saved gameplay. Deleting that state deliberately forces dependency verification and a rebuild on the next clean launch.

## One-time bootstrap

An old launcher cannot download its replacement until this commit reaches the local checkout. After developers publish this change, review `git status` in the existing checkout and preserve local work first. On a clean checkout of the playable branch:

```powershell
git fetch origin refs/heads/integrate/new-castaway
git merge --ff-only FETCH_HEAD
.\"Open Paradise Island.bat"
```

If local files/changes, unpushed commits, or divergence prevent this, resolve them deliberately first. The new launcher will not bypass those protections. No coding agent should replace launcher files with uncommitted copies as an installation shortcut. Close an old server window before the first launch of the new flow.

## Validation

Run `node --test tests/startup.test.mjs`. Tests use disposable local bare remotes, separate author/player clones, real Git, real npm installs/builds of a tiny fixture, and the actual `serve.mjs` on ephemeral ports. They do not alter the active repository or create fake divergent history in it.

Coverage: no-update and fast-forward cases; tracked/untracked local work; wrong/detached branches; unpushed/divergent histories; missing Git/branch and unavailable remote; initial/cached installs/builds; source and docs-only updates; manifest changes; absent/modified output; install/build failures and retries; real server/static/notebook/music readiness; correct-version reuse; stale/foreign servers and startup failure; Windows batch messages/pause/error exit and missing-Node guard.

All nine test groups passed on Windows with Node 24 and real Git/npm. The implementation was also built with the real Paradise Island dependencies and checked through the existing local server in Chromium using D3D11: the boot overlay completed, the island rendered, all 230 wildlife registrations were present, and no console/page errors were reported. The existing duplicate `owl` key build warning is unchanged. These startup checks do not change gameplay, assets, animation, rendering configuration, or save formats.

This change was developed in `D:\ParadiseIsland-Startup`, isolated from the active `D:\Paradise Island` checkout. The follow-up local-content adjustment ignores the five local songs and three generated backup snapshots without changing their bytes. Once the published ignore rules are preflighted against the checkout and no other changes remain, the active checkout can be safely fast-forwarded to activate the new launcher. Notebook revision 49 still has zero ready notes and three open notes (boa motion/size, arboreal boa resting, owl proportions); none was changed.

## Files changed

- `Open Paradise Island.bat`: visible checked startup, readable failure pause, no silent build/file fallback.
- `startup.config.json`: one playable remote/branch/port configuration.
- `startup.mjs`: protected Git synchronization, install/build fingerprints, launcher lock, server readiness/identity, browser opening.
- `serve.mjs`: local-only GET `/api/startup` identity; existing server and notebook/music operations retained.
- `.gitignore`: local `.paradise-startup/` state excluded.
- `CLAUDE.md`: commit/push-before-user-testing convention and workflow link.
- `docs/STARTUP_WORKFLOW.md`: setup, exact flow, recovery, bootstrap, and validation.
- `tests/startup.test.mjs`: disposable Git/npm/server and Windows batch regression tests.

## Local songs and generated notebook backups

User songs belong directly in `D:\Paradise Island\music\`. The server and build/launch playlist refresh enumerate this directory independently of Git, so ignored songs are still available and playable. The following root-anchored rules cover only the six supported audio extensions, including mixed-case filenames; they do not ignore music scripts, documentation, subdirectories, or unrelated assets:

```gitignore
/music/*.[mM][pP]3
/music/*.[oO][gG][gG]
/music/*.[wW][aA][vV]
/music/*.[mM]4[aA]
/music/*.[fF][lL][aA][cC]
/music/*.[oO][pP][uU][sS]
/notes/backups/island-notes.r[0-9]*.????-??-??T??-??-??-???Z.json
```

The last rule matches the timestamped recovery snapshots generated by `serve.mjs` before saving notes. The three local files contain valid notebook documents at revisions 49, 50, and 51 and match this generator. They remain on disk for recovery. The live `notes/island-notes.json`, its summary, and other JSON/source files remain protected. Existing tracked songs and historical tracked backups stay tracked; their edits still block startup. No `git rm --cached` is used.

Regression coverage verifies ignored audio and snapshots permit a clean update check, local audio remains in the HTTP playlist/static server, tracked-song edits and real source/notes changes still stop startup, and a remote filename collision cannot replace an ignored local song. First-time bootstrap must preflight both clean source state and collisions against incoming paths; local-content hashes are checked after activation.
