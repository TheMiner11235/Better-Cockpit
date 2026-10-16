# Fix Log

## Applied fixes

Timestamp: 2026-10-14 01:14:15
#46: Provide passphrase strength feedback when creating a encrypted partition.
- **Files**: pkg/lib/cockpit-components-password.tsx (backup: patches-backup/cockpit-components-password-tsx-20261014-011415), pkg/storaged/dialog.jsx (backup: patches-backup/storaged-dialog-jsx-20261014-011415), pkg/storaged/block/format-dialog.jsx (backup: patches-backup/storaged-format-dialog-jsx-20261014-011415), pkg/storaged/crypto/keyslots.jsx (backup: patches-backup/storaged-keyslots-jsx-20261014-011415)
- **Status**: patched - added a reusable `PasswordStrength` component (with a raw pwscore wrapper that reports whether pwscore is usable, so the meter hides itself instead of always claiming "Weak"). `PassInput` gained a `strength_meter` option which renders the meter under the field; enabled it on the *new* passphrase fields (format dialog + add/change keyslot). Confirm/old passphrase fields are left alone.
- **Verified**: eslint clean; `node_modules/.bin/tsc` reports no errors for the changed TS; `./build.js storaged` succeeds and the bundle contains the meter + `/usr/bin/pwscore`. Browser check pending (log in to localhost:9090, Storage -> create encrypted partition, type a passphrase).

Timestamp: 2026-10-14 17:47:04
#19920: btrfs: Subvolumes should not be shown when there are no subvolumes (Anaconda).
- **Files**: pkg/storaged/btrfs/subvolume.jsx (backup: patches-backup/storaged-btrfs-subvolume-jsx-20261014-174704), pkg/storaged/btrfs/filesystem.jsx (backup: patches-backup/storaged-btrfs-filesystem-jsx-20261014-174704), pkg/storaged/btrfs/volume.jsx (backup: patches-backup/storaged-btrfs-volume-jsx-20261014-174704)
- **Status**: patched - in Anaconda mode `make_btrfs_subvolume_pages` no longer creates the synthesized "top-level" subvolume page when there are no real (non-root) subvolumes, so a lone `/` is not shown as a subvolume. Added an exported `btrfs_create_subvolume_action(volume)` ("Create subvolume", disabled outside Anaconda with the "At least one subvolume needs to be mounted" excuse) and attached it to the single-device "btrfs filesystem" card and the multi-device "btrfs volume" card, so "Add subvolume" is available from the partition/volume menu even when no subvolumes exist (and remains available afterward).
- **Verified**: eslint clean; `./build.js storaged` succeeds and `dist/storaged/storaged.js` contains the new action. Non-Anaconda behavior is intentionally unchanged (the "top-level" page is still created there), keeping check-storage-btrfs expectations intact. Browser check pending (Anaconda storage, or `client.in_anaconda_mode` mocked).

Timestamp: 2026-10-14 17:50:58
#19497: Don't allow shrinking a partition/FS to 0.
- **Files**: pkg/storaged/block/resize.jsx (backup: patches-backup/storaged-block-resize-jsx-20261014-175058), pkg/storaged/dialog.jsx (backup: patches-backup/storaged-dialog-jsx-20261014-175058)
- **Status**: patched - the shrink dialog's `SizeSlider` now gets `min: round_size` (one partition MiB / one LVM extent), so the slider can no longer be dragged to 0 and the text input shows "Size must be at least ...". Validation already rejected a literal 0 ("Size cannot be zero"), but the action button was not disabled (`disable_on_error` only tracks teardown), so this makes the lower bound explicit in the UI. Deliberately did *not* introduce the ~256 MB floor suggested in the issue, to keep check-storage-resize (which legitimately shrinks ext4/LUKS to 200 MB) valid.
- **Verified**: eslint clean; `./build.js storaged` succeeds.

Timestamp: 2026-10-14 17:52:45
#21760: Allow storage size specification in base-2 units.
- **Files**: pkg/storaged/utils.js (backup: patches-backup/storaged-utils-js-20261014-175245), pkg/storaged/test-util.js (backup: patches-backup/storaged-test-util-js-20261014-175245)
- **Status**: patched - `get_byte_units()` now also offers `B`, `KiB`, `MiB`, `GiB` and `TiB` in the size unit selector, so exact binary sizes can be entered (e.g. "16" MiB or "16777216" B). Automatic unit selection still only considers the decimal units (MB/GB/TB), so the default unit is unchanged. Updated the QUnit test in `pkg/storaged/test-util.js` for the new unit list.
- **Verified**: eslint clean; the selection logic matches the updated test for all 9 cases (verified with a standalone node harness); `./build.js storaged` succeeds. QUnit/browser run pending.



---

### #20766 make cockpit-desktop error message of bridge not found easier to understand
- **Files**: src/client/cockpit-client (backup: patches-backup/cockpit-client-20261013-210021), src/ws/cockpit-desktop.in (backup: patches-backup/cockpit-desktop-in-20261013-210155)
- **Status**: patched - added clearer errors when bridge/ssh missing in cockpit-desktop.in; improved bridge start checks

---




### #17107 selinux: Add a way to select all (to make dismissing easier)
- **Files**: pkg/selinux/setroubleshoot-view.jsx (backup: patches-backup/setroubleshoot-view-20261013-212126)
- **Status**: patched - added "Select all"/"Deselect all" buttons next to the Dismiss action

---

### #19860 / #22889 / #22825 host switcher list does not scroll
- **Status**: already fixed in this tree. Upstream commit `7e0f2ba0` ("host-switcher: Scrollbar for many entries (#23412)", 2026-06-24) adds `overflow:auto; max-block-size: calc(100vh - spacer--3xl*3)` to `.view-hosts .sidebar-hosts .pf-v6-c-nav` and removes the mobile `max-block-size` override. Both are present in `pkg/shell/nav.scss`. No patch applied.

---

### #21126 The terminal title is not centered
- **Files**: pkg/systemd/terminal.scss (backup: patches-backup/terminal-scss-20261013-220601)
- **Status**: patched - `.terminal-title` now flex-grows and centers its text in the space left of the toolbar (with ellipsis on overflow).

---

### #19857 Logs: Unit filter doesn't actually filter on units
- **Files**: pkg/systemd/logsHelpers.js (backup: patches-backup/logsHelpers-js-20261013-220140)
- **Status**: patched - `getOptionsFromTextInput` now recognizes the `unit:` token (and `service:`) and maps it to the internal `service` option consumed by `getGrepFiltersFromOptions`, instead of leaking it into free-text grep.

---

### #23588 Size entry in storage doesn't work with localized radix character
- **Files**: pkg/storaged/utils.js (backup: patches-backup/storaged-utils-js-20261013-221500), pkg/storaged/dialog.jsx (backup: patches-backup/storaged-dialog-jsx-20261013-221500)
- **Status**: patched - added `parse_number()` in `pkg/storaged/utils.js` which understands the localized decimal separator (and grouping separators) emitted by `cockpit.format_number`; `SizeSlider` validation, its slider preview, and the min/max `sanitize` comparison now use it instead of `Number()`/unary `+`. Verified the parse logic for `cs`/`de`/`fr`/`en` locales via node. Suggested test: in check-storage-resize (or a new test), set `cockpit.language="cs"` and enter `1,5` GB.

---

### #17748 Clickable BZ links in update changelog
- **Files**: pkg/packagekit/updates.jsx (backup: patches-backup/updates-jsx-20261013-215812)
- **Status**: patched - linkify `rhbz#N`/`bz#N` to bugzilla.redhat.com and `jira#N` to issues.redhat.com in the plain-text changelog; only on RHEL/Fedora/CentOS (via `cockpit.info.os_release`). Note: markdown changelogs (test mock data only) are left as-is. Suggested test: assert links in test/verify/check-packagekit using `testlib.sit()`.

---

### #20355 Logs: "Clear all filters" leaves stale filter state
- **Files**: pkg/systemd/logsHelpers.js (backup: patches-backup/logsHelpers-js-20261013-223000), pkg/systemd/logs.jsx (backup: patches-backup/logs-jsx-20261013-223000), pkg/systemd/logsJournal.jsx (backup: patches-backup/logsJournal-jsx-20261013-223000)
- **Status**: patched - moved `timeFilterOptions`/`getTimeFilterOption` from `logs.jsx` into `logsHelpers.js` (exported) so they can be shared. `logs.jsx` no longer threads `defaultSince` down as a prop; `logsJournal.jsx` now derives `defaultSince` from the current `cockpit.location.options` inside `updateQuery`, so clearing filters reads the fresh location instead of an async `timeFilter` state that lagged behind `locationchanged`. Suggested test: in check-system-journal, apply a time+priority filter then Clear all filters and assert the query is empty.

---

## oled-nova UI (custom packages + shell branding)

Timestamp: 2026-10-14 23:30:00

### Packages: `oled-nova-core` (Monitor) + `oled-nova-storage` (File Studio)
- **Files**: pkg/oled-nova-core/* (manifest name `monitor`: rings dashboard, collapsible process list, full-bleed xterm terminal with settings gear), pkg/oled-nova-storage/* (manifest name `storage`, `priority: 10`, shadows the built-in Storage package), files.js.
- **Status**: built (`node build.js oled-nova-core`, `node build.js oled-nova-storage`), eslint clean, deployed system-wide to `/usr/share/cockpit/oled-nova-{core,storage}`.

### Manifest overrides (hide stock nav entries; no pkg/shell rebuild on 287)
- **Files** (server `/etc/cockpit/`): `systemd.override.json` `{"menu":{"logs":null},"tools":{"terminal":null}}`, `networkmanager.override.json` `{"menu":{"index":null}}`, `users.override.json` `{"menu":{"index":null}}`, `apps.override.json` `{"tools":null}`, `machines.override.json` `{"menu":{"vms":null}}`, `packagekit.override.json` `{"tools":{"index":{"label":"Updates"}}}`.
- **Result**: nav is exactly Overview, Monitor, File Studio, Services, Terminal, Updates.

### Shell branding + autohiding sidebar: `branding.css`
- **File**: `branding.css` (repo root) — OLED dark-purple remap of the PatternFly/Cockpit dark tokens (`--pf-global--*`, `--ct-color-*`, accent `#a855f7`, true-black `#000`), plus a desktop (>=768px) `.page` grid override turning the built-in sidebar into an overlay that slides in on hover/focus (`grid-template-areas: "switcher header" "main main"`, `#content` spans full width, `#nav-system` `position:fixed` with `translateX(-100% + 12px)` -> `0`).
- **Deployment (IMPORTANT for 287)**: Cockpit **287 ignores `/etc/cockpit/branding/`** (that config-dir branding root was added in later versions). On 287 the resolved `branding.css` is the distro file **`/usr/share/cockpit/branding/debian/branding.css`** (served, template-expanded `${NAME}` -> "Debian GNU/Linux"). The theme was therefore installed **over that file** (a copy is also left at `/etc/cockpit/branding/branding.css` for forward compatibility).
  - Served at `/cockpit/static/branding.css`; loaded by `shell/index.html` *after* `index.css`, so same-specificity token overrides win.
- **Verified live (puppeteer, headless Chrome @ 1500x950)**: served branding = our file (7360 B, `on-accent`); `.page` areas `"switcher header" "main main"`; `#content` 1500px wide; `#topnav` bg `rgb(14,14,22)`; body `#000`; `#nav-system` fixed, `transform matrix(...,-228,0)` closed -> `0` on hover; Monitor frame = `../monitor/index.html` (28 ring nodes + process list head), File Studio = `../storage/index.html` (`.on-files-page`), Terminal = `../monitor/terminal.html` (`.on-term-page` + gear). Console errors limited to the known benign set (401 on login, non-root `Tracer ... access-denied`, tuned poll, updates auth).
- **Rollback**:
  ```
  sudo cp -a /home/n/cockpit-backup-20261014-214113/branding/debian-branding.css \
             /usr/share/cockpit/branding/debian/branding.css
  sudo systemctl restart cockpit.socket cockpit
  ```
  (the pre-theme original Debian file is backed up there; the pre-existing full package backup is `/home/n/cockpit-backup-20261014-214113/`).

---

## oled-nova UI rework (Tasks 1-8)

Timestamp: 2026-10-15 20:50:33

### 1. File Studio: remove title + subhead
- **Files**: pkg/oled-nova-storage/lib/filestudio.js
- **Status**: patched - dropped the `File Studio` title and `CodeMirror` subhead `head` block; `this.element.append(head, layout)` -> `append(layout)`.

### 2. Terminal theme fix (themes did not apply)
- **Files**: pkg/oled-nova-core/terminal.html, pkg/oled-nova-core/style.css, pkg/oled-nova-core/lib/termpage.js
- **Status**: patched - removed the dead `terminal.css` `<link>`; removed the forced `.xterm-viewport { background: transparent !important }` that defeated theme backgrounds; `.on-term-wrap` and `body.on-term-body` now use `var(--on-term-bg, ...)`. Added `TerminalPage._apply_term_bg()` which sets `--on-term-bg` from `term_theme(...).background`, called from `start()` and `apply_settings()`.
- **Verified live**: stock `#000`, `dracula` -> `rgb(40,42,54)`, `solarized` -> `rgb(0,43,54)`; viewport stays transparent so the themed wrap shows through.

### 3. Monitor merged Overview rework
- **Files**: pkg/oled-nova-core/{dashboard.js,style.css,manifest.json,index.html}, pkg/oled-nova-core/lib/{metrics.js,rings.js}
- **Status**: patched - new `lib/metrics.js` (DiskIo, PowerSampler, disk_temperature, top_processes, format helpers) and `lib/rings.js` small-ring variant; `dashboard.js` rewritten: CPU/MEM rings show top process + PID under the title, Disk becomes a 4-small-ring card (read/write/temp/used, `on-span-2`), Power (W) + CPU temp (°C) card replaces the mislabeled ring, Host card is clickable -> full metrics modal (Model, Machine ID, Asset tag, live system time, uptime, perf profile, SSH keys). Sampling loop hardened (`Promise.allSettled` + `busy` guard + try/catch, 1s tick, slow sensors every 3rd tick). Manifest label "Overview" order 10.
- **Verified live**: 68 ring nodes, CPU `cockpit-bridge · 628018` / MEM `java · 553758` subs, Disk group (4 rings) + Power & thermal group (2 rings), info modal opens with 7 live rows.

### 4. Sidebar sliver / content offset
- **Files**: branding.css
- **Status**: patched - added `--on-sliver: 12px`; `.page > .area-ct-content { margin-left: var(--on-sliver) !important }`; `#nav-system` transform uses `calc(-100% + var(--on-sliver))`.
- **Verified live**: `--on-sliver` 12px, content margin-left 12px, nav transform `-228px` (sliver visible).

### 5. Shell chrome theming (CSS-only; no pkg/shell rebuild on 287)
- **Files**: branding.css
- **Status**: patched - appended `.pf-c-masthead`, `#topnav`, `.pf-c-dropdown__menu*`, `.pf-c-popover__content`, `#hosts-sel`, `.pf-c-divider` overrides.
- **Verified live**: masthead bg `rgb(14,14,22)`, body `#000`.

### 6. Built-in package frames (287 Services + generic PF v4)
- **Files**: branding.css
- **Status**: patched - appended Services rules (`.services-header/toolbar`, `.services-list`, `.ct-card*`, `.service-unit-*`, `.status-*`, `.cockpit-log-*`) and generic PF v4 surfaces (`.pf-c-page__main-section`, `.pf-c-card`, `.pf-c-toolbar`, `.pf-c-table`, `.pf-c-nav__link.pf-m-current`). Note: the 287 built-in `systemd`/`packagekit` frames do **not** link `branding.css`, so the deploy step injects `static/branding.css` into `systemd/{services.html,index.html}`.
- **Verified live**: services frame has `branding.css` linked, `pf-theme-dark`, body `#000`, card bg `rgb(8,8,12)`.

### 7. New package: `oled-nova-packages` (Software)
- **Files**: pkg/oled-nova-packages/{manifest.json,index.html,index.js,style.css,lib/catalog.js}, files.js
- **Status**: added - manifest name `software` (`menu.index` label "Software", order 40). Four tabs: Updates (PackageKit `get_updates`/`update_packages`), Installed (filter list), Available (repo search), Recommended (derived from installed packages via `lib/catalog.js` CATEGORIES/RELATED graph). Busy overlay + cancel + error toast; reuses `pkg/lib/packagekit.js`.
- **Verified live**: Updates "The system is up to date.", Installed 600 rows filterable, Available search ready, Recommended 18 rows ("Based on the packages already installed on this system.", e.g. apache2 "You use nginx — more web serving").

### 8. Deploy (server, Cockpit 287)
- **Tarball**: `/tmp/on.tgz` (1,880,603 B) extracted to `/usr/share/cockpit/` (adds `oled-nova-packages`).
- **Branding**: copied to `/usr/share/cockpit/branding/debian/branding.css`.
- **Frame link injection**: `static/branding.css` inserted into `/usr/share/cockpit/systemd/{services.html,index.html}` (1 occurrence each).
- **Override change**: `systemd.override.json` is now `{"menu":{"logs":null,"index":null},"tools":{"terminal":null}}` (hides the built-in Overview) and `packagekit.override.json` is now `{"tools":null}` (hides the built-in Updates tool, superseding the earlier label-only override).
- **Verified live (headless Chrome)**: nav is exactly `Overview, File Studio, Software, Services, Terminal`; all four oled-nova pages and Services render themed; built-in Overview + Updates hidden.
- **Rollback**:
  ```
  sudo rm -rf /usr/share/cockpit/oled-nova-core /usr/share/cockpit/oled-nova-storage /usr/share/cockpit/oled-nova-packages
  sudo cp -a /home/n/cockpit-backup-20261015-205033/debian-branding.css    /usr/share/cockpit/branding/debian/branding.css
  sudo cp -a /home/n/cockpit-backup-20261015-205033/systemd-services.html  /usr/share/cockpit/systemd/services.html
  sudo cp -a /home/n/cockpit-backup-20261015-205033/systemd-index.html     /usr/share/cockpit/systemd/index.html
  sudo cp -a /home/n/cockpit-backup-20261015-205033/*.override.json        /etc/cockpit/
  sudo systemctl restart cockpit.socket cockpit
  ```
  Backup: `/home/n/cockpit-backup-20261015-205033/` (flat: `debian-branding.css`, `systemd-services.html`, `systemd-index.html`, and `{apps,machines,networkmanager,packagekit,systemd,users}.override.json`).

---

## oled-nova UI rework (Task batch 2)

Timestamp: 2026-10-15 21:40:50

### 9. Terminal: missing xterm.css (hashes line + top-left artifacts)
- **Files**: pkg/oled-nova-core/terminal.html
- **Root cause**: the build emits `terminal.css` (bundled `@xterm/xterm/css/xterm.css`) but `terminal.html` never linked it. Without it, `.xterm-helper-textarea` renders visible at the top-left (the "resize icon") and `.xterm-width-cache-measure-container` / `.xterm-char-measure-element` render their `$$$$…` / `~~~~…` test text inline (the "hashes line above the typing line").
- **Status**: patched - re-added `<link href="terminal.css" rel="stylesheet">`.
- **Verified live**: frame links `style.css` + `terminal.css`; `.xterm-helper-textarea` opacity 0; char-measure element at `left:-139978` + `visibility:hidden`; width-cache container `0x0`; screen text clean (`n@server:~$`).

### 10. Terminal: selection colour + move to System
- **Files**: pkg/oled-nova-core/lib/settings.js, pkg/oled-nova-core/manifest.json
- **Status**: patched - `stock` theme `selectionBackground` `#ffffff33` -> `#a855f744`; `terminal` moved from `tools` to `menu` (order 90, added `graphs` keyword).
- **Verified live**: System section nav = `Overview, File Studio, Software, Terminal, Services`.

### 11. Overview: gear toggles graph view; drop subtitle + "Show full metrics"
- **Files**: pkg/oled-nova-core/{dashboard.js,style.css}, new pkg/oled-nova-core/lib/graphs.js
- **Status**: patched - removed `.on-view-sub` and `.on-info-more`; added a gear button (title "Toggle graph view") that toggles `.on-graph-mode` and persists `settings.overview_view`; new `Graph` class (canvas rolling line graph, time-based lerp, autoscale, `ResizeObserver`); graph view shows CPU, Memory, Disk read, Disk write, Power, CPU temp.
- **Verified live**: 6 canvases with correct titles; toggling hides the rings grid and shows the graphs grid.

### 12. Rings + graphs smoothing (TMOG)
- **Files**: pkg/oled-nova-core/lib/rings.js, pkg/oled-nova-core/lib/graphs.js
- **Status**: patched - decoupled draw from fetch via `requestAnimationFrame`, time-based exponential lerp `displayed += diff * (1 - Math.exp(-dt / tau))`, `tau ≈ 0.15 s`.

### 13. Disk rings 2x2
- **Files**: pkg/oled-nova-core/style.css
- **Status**: patched - `.on-group-rings` -> `repeat(2, minmax(0, 1fr))`; the Disk card's 4 small rings now lay out 2x2.

### 14. Processes: current-user filter + Del key + no End-process button
- **Files**: pkg/oled-nova-core/lib/processes.js
- **Status**: patched - defaults to the current user (`cockpit.user()`) with a `Mine`/`All` toggle; removed the End-process (kill) button (double-click still kills); `Del` terminates the selected row (handler bound in `open()`, unbound in `close()`).

### 15. Software: styling, Available pagination + source/sort, Updates refresh, sticky layout
- **Files**: pkg/oled-nova-packages/{style.css,index.js}
- **Status**: patched - CSS: added `.on-btn-danger:hover`, `.on-btn:disabled`, `.on-input`, `.on-select`, `.on-input.on-grow`, `.on-src`, `.on-pager*`; `#oled-root { height:100%; overflow:hidden }` and `.on-soft-page { overflow:hidden }` (fixes the white search box and the scrolling toolbar). Available now lists the whole repo (`GetPackages` `FILTER_NOT_INSTALLED|NEWEST|ARCH|NOT_SOURCE`) rendered client-side with live search filter, a Source select (apt always + snap/flatpak/npm/pip when present; flatpak apps indexed best-effort), a sort select (Name up/down, Version up/down, Source) and a Google-style pager (`‹ 1 2 3 … N ›`) top and bottom, 50/page. Updates runs `PK.refresh()` before `get_updates()`; the Refresh button forces a cache refresh.
- **Verified live**: Available 50 rows, pager `‹ 1 2 3 … 1267 ›`, Source tag `apt`, sort options incl. `Source`; Updates "The system is up to date."; `#oled-root` height 879px, overflow hidden.

### 16. Deploy (server, Cockpit 287)
- **Tarball**: `/tmp/on.tgz` (1,892,801 B) extracted to `/usr/share/cockpit/`; branding copied; `static/branding.css` injected into `systemd/{services.html,index.html}`; overrides merged; cockpit restarted.
- **Rollback**: same as the 1-8 block but with backup dir `/home/n/cockpit-backup-20261015-214050/`.


