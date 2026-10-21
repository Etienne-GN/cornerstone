# SDD ledger — plan: docs/superpowers/plans/2026-10-21-omnibar.md

Spec: docs/superpowers/specs/2026-10-21-omnibar-design.md
Repo: /home/etienne/git/omnibar, branch main (from upstream c3aed93)

## Setup

- Task 1 Steps 1-2 (clone, remote rename, branch, doc copy) done by
  controller as workspace setup; docs untracked until Task 1 commit.
- Ruling: develop on branch `main` of the fresh fork — the approved plan
  names it (Task 1 Step 1) and the repo is private/local with no remote
  but `upstream` — cost if wrong: a branch rename.

## Pre-flight scan

| Tasks | Shared file/interface | Finding |
|---|---|---|
| 2 / 3 | smoke scenario reads UUID from installed metadata | consistent |
| 3 / 4 | schema file renamed in 3, keys added in 4 | consistent (4 edits renamed file) |
| 4 / 5 | compat.menuOpen/Close, policy.sourceIsVisible | consistent |
| 4 / 6 | EXCLUDED_ROLES has quickSettings; 6 builds a dedicated QS mirror | consistent (separate path) |
| 5 / 6 | host {monitorIndex, menuManager, vertical}, syncOrientation | consistent |
| 6 / 10 | secondary SYSTEM_MENU = QS mirror; 10 routes via host.openActionCenter | consistent |
| 7 / 11 | ui/SettingsOmnibar.ui actionCenterGroup created in 7, filled in 11 | consistent |
| 9 / 10 | ActionCenter open/close/toggle; router owned by AC | consistent |
| 9 / 11 | schema key action-center | consistent |
| 2 / 7 | run.sh interface has no `--viewer`; 7 Step 3 uses it | CONFLICT → ruling R2 |
| 1 | Step 5 `npm ci` but repo has yarn.lock, no package-lock.json | CONFLICT → ruling R1 |
| 8, 11 | STOP for Etienne's GNOME 51 check vs continuous execution | ruling R3 |
| 1-11 self-consistency | tests vs code per task checked | no other conflicts |

- Ruling R1: Task 1 uses `npm install` (project-local node_modules) and
  gitignores package-lock.json instead of `npm ci` — `npm ci` needs a
  package-lock that upstream does not ship (yarn.lock) — cost if wrong:
  lint versions float within package.json ranges.
- Ruling R2: Task 7 Step 3 replaced by an automated nested scenario
  `prefs.js` asserting the catalog is published (2 monitors, primary first)
  and the controller drops/restores a mirror when the visibility key
  changes; the .ui file is checked with `gtk4-builder-tool validate`; the
  interactive prefs-window check moves to Etienne's GNOME 51 checklist —
  prefs run in a separate process the harness cannot drive headless —
  cost if wrong: a prefs-UI bug caught later by Etienne instead of by us.
- Ruling R3: honour the plan's STOPs after Task 8 and Task 11 — the spec
  makes a step "not done until it passes" on GNOME 51, which only Etienne
  can run — cost if wrong: idle time between steps.

## Progress
- Ruling R4: test script is `node --test 'tests/unit/**/*.test.mjs'` — Node 22 rejects a directory argument — cost if wrong: none.
- Ruling R5: Co-Authored-By trailer names the model actually running each subagent (Etienne's CLAUDE.md rule) — cost if wrong: trailer wording.
- Task 1: minor (deferred): tests/ not covered by lint globs; smoke.test.mjs:6 exceeds prettier width
- Task 1: complete (commits c3aed93..4d8e083, review clean)
- Task 2: owner decision (Etienne, 2026-10-21): nested shell gets a private system bus; must not reach host GDM/logind. Fix dispatched to Task 2 implementer as an added requirement.
- Task 2: review — Important: shared host system bus (GDM, logind LockedHint/Inhibit, polkit agent, NM agent). Ruling: scenario-name validation before rm -rf promoted Minor→Important — destructive path — cost if wrong: none.
- Task 2: fix round 1/5 dispatched (private system bus + guards, scenario-name validation, DONE sentinel, HOME isolation, USER/setsid, _build gitignore, comments)
- Task 2: minor (deferred): pid reuse window between wait and pkill -s (negligible)
- Task 2: fix round 1/5 (6 addressed, 0 open; commits b58377f..97100b0)
- Task 2: minor (deferred): GDM guard misses "Not calling RegisterX" path (covered by done() bus assert); done() sentinel name not tied to scenario
- Task 2: complete (commits 4d8e083..97100b0, review clean)
- Task 3: Ruling: empty metadata.url (plan-mandated) → hide "See what's new" action and About link while url is empty, no invented URL — keeps plan + spec (no upstream identity) — cost if wrong: no release link until a real repo URL exists.
- Task 3: minor (deferred): rename.sh sed uses unescaped dots in old schema regex; orphaned translations for two %s msgids (documented)
- Task 3: fix round 1/5 dispatched (empty-url links, Makefile empty-identity guard, worktree teardown robustness)
- Task 3: fix round 1/5 (2 addressed, 1 open — silent teardown catches; commits b5c3468..1b76187)
- Task 3: fix round 2/5 (1 addressed, 0 open; commits 1b76187..55396ee). Controller verified evidence gap: npm test 6/6 pass at 55396ee, no leftover worktree.
- Task 3: minor (deferred): empty-url GUI paths only smoke-tested; NAME not guarded in Makefile
- Task 3: complete (commits 97100b0..55396ee, review clean)
- Ruling R6 (Task 4): 51 detection via Config.PACKAGE_VERSION major >= 51 (exported IS_51), not BoxPointer.PopupAnimation === undefined — PopupAnimation is still exported in 51.1 (boxpointer.js:7), so the plan's probe is wrong; global "prefer feature detection" yields where no reliable probe exists — cost if wrong: one constant to change if a 51.x point release changes the API again. Brief amended.
- Task 4: minor (deferred→carried into Task 5): loadGjs sloppy mode (add 'use strict'); policy.readVisibility swallows JSON errors silently (log once)
- Task 4: minor (deferred): loadGjs exported let snapshots; redundant parseInt fake; IS_51 boundary tests
- Task 4: complete (commits 55396ee..776eb61, review clean)
- Ruling R7: loadGjs evaluates in strict mode — GJS modules are strict; testing the 3400-line port sloppy would hide bugs — cost if wrong: none. Carried into Task 5.
- Ruling R8: policy.readVisibility logs invalid JSON once per distinct value (global no-silent-errors rule) while still returning {} (spec) — cost if wrong: one log line. Carried into Task 5.
- Task 5: dispatched (BASE 776eb61), model opus
- Ruling R9 (Task 5): menus open/close via compat helpers with animation on both 50 and 51 (except MMB's deliberate no-animation paths) — consistent behaviour across versions — cost if wrong: animation preference.
- Ruling R10 (Task 5): port MMB CSS rules for used mm-* classes into src/stylesheet.css, keep mm- names — cost if wrong: renaming later.
- Ruling R11 (Task 5): namespace all GTypeNames with `Omnibar` — GType registrations outlive disable in one shell process; switching from MMB in-session would collide — cost if wrong: none.
- Ruling R12 (Task 5): upstream dash-to-panel classes keep default GType names — GNOME Shell's loader prefixes default names with the extension uuid (seen live: "Gjs_apps-menu_gnome-shell-extensions_gcampax_github_com_extension_ApplicationMenuItem"), so the omnibar uuid already separates them from dash-to-panel — cost if wrong: a type-name error on in-session switch, visible in the journal.
- Task 5: minor (deferred): tools/rename.sh does not rewrite `Omnibar` GType prefix or `[omnibar]` log prefix
- Ruling R13 (Task 5): untracked source-menu open-state handlers (inherited from MMB) fixed in Task 5, not deferred — lock = disable, so mirror-destroyed-with-menu-open is routine and later tasks build on clean teardown — cost if wrong: one extra fix round.
- Task 5: fix round 1/5 dispatched (menu handler tracking/restore + no own-prop shadow, policy log e, rename.sh GType/log prefixes)
- Task 5: minor (deferred): `excluded roles have no special branch` test is weak
- Task 5: fix round 1/5 (4 addressed, 0 open; commits 16b3bed..338a429)
- Task 5: minor (deferred → final review): workspace abort can orphan a pending _workspaceMenuRestoreId timer (reopen within 250 ms then destroy); cross-mirror close-only path leaves menu.sourceActor on mirror A (inherited from MMB)
- Task 5: complete (commits 776eb61..338a429, review clean)
- Task 6: note for Task 7: policy key 'main' = dash-to-panel primary monitor (dtpPrimaryMonitor), catalog must use same index. Note for Task 9: Makefile must package src/actionCenter/ (src/mirror/ packaging added in Task 6).
- Task 6: minor (deferred): plan.js `index` field unused by controller; mirrors scenario doesn't assert stock QS container visible after restore; policy-key test can't distinguish dtp primary vs system primary; mirrors always sort first in secondary boxes (document); empty sources recreated each refresh
- Task 6: complete (commits 338a429..5593302, review clean)
- Task 7: dispatched (BASE 5593302), R2 Step 3 replacement sent by message (brief file not amended)
- Task 7: note: implementer validated .ui via python Gtk.Builder + Adw.init(), which likely connected to the live display (no window, read-only). Ruling R14: future UI validation must not initialise GTK against the live session — use `gtk4-builder-tool` where possible or validate inside the nested harness — cost if wrong: none.
- Task 7: minor (deferred): ENABLED_KEY duplicated in prefs.js and controller.js (export from policy.js); prefs scenario primary check by size only
- Task 7: note for Task 11: per-monitor groups append after actionCenterGroup (page.add) — reorder when actionCenterGroup becomes visible
- Task 7: complete (commits 5593302..fc535fb, review clean)
- Task 8: fix round 1/5 dispatched (backup path out of repo root; TTY fallback; panel-position UI path; checklist scratch file; wording)
- Task 8: fix round 1/5 (4 addressed, 1 open — last-resort gsettings literal could wipe other extensions; commits 66e799d..ef1f506). Fix round 2 dispatched.
- Task 8: fix round 2/5 (2 addressed, 0 open; commits ef1f506..31e20f4)
- Task 8: minor (deferred): unescaped dots in sed uuid pattern (harmless)
- Task 8: complete (commits fc535fb..31e20f4, review clean)
- STOP (R3): step-1 hand-off to Etienne for GNOME 51 checklist; Task 9 waits for his result.
- Out-of-plan: viewer mode (337340a, unreviewed) + owner-approved PIPEWIRE_RUNTIME_DIR passthrough for the devkit viewer (holo's tools/devshell.sh keeps the full host env; ours passes only this).
- Owner request (2026-10-21 12:51): test live without logout. Ruling R15: fix teardown crash (_restoreSystemMenu after QS gone) + clipboard St-CRITICAL + unexplained mirrors/prefs failures BEFORE any live install — a shell crash on Wayland ends his session and lock = disable — cost if wrong: ~15 min delay. Live load path: Looking Glass createExtensionObject+loadExtension typed by Etienne (no unsafe mode, no Eval by Claude).
- Teardown fixes: 596c907 (pipewire), 3458500 (bug1), ec6e006 (bug2); controller verified npm 65/65, smoke/mirrors/teardown PASS; zip built. Live install steps handed to Etienne (he runs them). Review of 337340a..ec6e006 dispatched.
- Review 31e20f4..ec6e006 (viewer + teardown fixes): Approved, no Critical/Important. Controller confirmed teardown shell.log reaches "Shutting down GNOME Shell".
- minor (deferred): shutdown-time "already disposed" criticals with ArcMenu (theme-context handlers outlive panels); README says "one host variable" but PIPEWIRE_RUNTIME_DIR+WAYLAND_DISPLAY reach the whole nested shell; duplicate viewer test in run.sh; viewer nice 10 (needs owner OK); shared _build race between parallel runs
- Owner override (2026-10-21 13:16): proceed with Tasks 9-11 before the GNOME 51 step-1 check (R3 stop lifted by Etienne). Live install deferred until after his meeting (he runs it).
- Task 9: note for Task 10: open() at a visible-but-unallocated source gives one NaN frame in BoxPointer — router must open only allocated sources (or open() guards); vertical-bar anchoring untested.
- Task 9: minor (carried into Task 10 — disable-path hardening): safety-pass loop not inside _step (actionCenter.js:214-227); setDimmed onStopped writes disposed effect if disable <400 ms after submenu close (actionCenter.js:101-107)
- Task 9: minor (deferred): widgetMover.test.mjs:78/:101 meaningless asserts; action-center key read once at enable (Task 11 owns live toggle); hosted widgets' closeCalendar/closeQuickSettings → Task 10
- Task 9: complete (commits ec6e006..f831fa1, review clean)
- Ruling R16 (Task 10): banner click handled by stopping `clicked` (as messageList.js) instead of a capture handler on _bannerBin — a capture handler would also eat the banner's close/action buttons — cost if wrong: none observed, scenario covers both.
- Ruling R17 (Task 10): shortcuts close the Action Center when open rather than toggle(source) re-anchoring it — matches stock toggle semantics — cost if wrong: one extra press to move it to another monitor.
- Task 10: note (→ final review): mirror/controller.js:189 refresh timeout touched disposed boxes during shutdown once; intellihide + open Action Center untested
- Task 10: fix round 1/5 dispatched (QS close drops no-animation arg → AC visible in screenshots; dim override reuse InstanceOverrides; qsMenu.close only closes AC when open)
- Task 10: minor (deferred → final review): _buttonMenus/InjectionManager list grows across dtp resets until disable; intellihide may hide bar while AC open (follow-up); controller.js:189 refresh timeout during shutdown
- Ruling R18 (Task 10): do not override QS button vfunc_hide on 51 — the primary QS button hiding while the AC is open is rare and closing the AC then is acceptable; another override adds teardown surface — cost if wrong: AC closes unexpectedly when the primary bar hides on 51.
- Task 10: fix round 1/5 (3 addressed, 0 open; commits 0dd7980..74de879)
- Task 10: complete (commits f831fa1..74de879, review clean)
- Task 11: fix round 1/5 dispatched (prefs-ui.js self-guard before Adw.init; step2 AC-off lock round; prefs connect-before-read; gjs child timeout; journal grep note)
- Task 11: fix round 1/5 (5 addressed, 0 open; commits 38641a4..0b9546a)
- Task 11: complete (commits 74de879..0b9546a, review clean)
- Final review dispatched (c3aed93..HEAD)
- Final review: not ready — I1 mirror detach not exception-safe (lock path), I2 workspace mirror re-click/abort timer; minors M1-M8. One fix wave dispatched: I1, I2, M1, M2, M3, M8. Ruling R19: M4/M5/M7 parked (cosmetic, tiny windows); M6 handled by telling Etienne to log out between live reloads — cost if wrong: cosmetic glitches.
- Final fix wave re-review: all addressed; minor (deferred): _cleanedUp set before _cleanup runs (early throw skips later cleanup steps); quick settings/clipboard/Astra/ArcMenu openers lack _unmirroredAnchor (3+ monitors). Controller verified at cc146fc: npm 95/95, 9 nested scenarios PASS, zip rebuilt.
