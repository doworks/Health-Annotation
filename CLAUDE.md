<!-- doworks-dev-rules:start -->
# Rules for working in this repo (synced from doworks/dev-tools — edit there)

This is a DoWorks Frappe app. Read these before changing anything.

## Branches and releases
- `version-16` is the default branch and the code for the new servers. Start every change with
  `git checkout -b fix/<topic> version-16` (or `feat/<topic>`), one change per branch.
- Push the branch and open a pull request to `version-16`. **Only the owner merges into `version-16` and releases.**
  Never push to `version-16` directly, even if GitHub allows it.
- `version-15` is a record of what the old servers run. `main`, `master` and `develop` are frozen. Do not commit to them.

## Never
- Never edit code on a server; every change goes through a pull request to `version-16`.
  (Old v15 servers: urgent fixes only, made on the server, and always repeated through a pull request on `version-16`.)
- Never modify frappe, erpnext or hrms. Shared changes to core behaviour go in a `doworks_core` app.
- Never add client-specific code paths, branches or copies. Client-specific behaviour goes behind a setting
  in this app (a Settings DocType field), so every client runs the same code.
- Never commit secrets, site names of clients, `site_config.json`, or built files (`public/dist`, `node_modules`).

## Always
- Keep `pyproject.toml` valid for Pilot: `[tool.bench.frappe-dependencies]` lists `frappe = ">=16.0.0,<17.0.0"`
  and every Frappe app this app imports (e.g. `erpnext`, `hrms`).
- Run the app's tests before committing; add tests for new behaviour.
- Local setup: an existing `bench` (put this app and its Frappe apps on `version-16`:
  `git fetch && git checkout version-16`, then `bench --site <dev site> migrate`), or Pilot
  (`python3 ../dev-tools/dev_setup.py`, then `pilot dev start`). Pilot's stricter packaging checks also run on
  staging before every release.
<!-- doworks-dev-rules:end -->
