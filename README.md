# Shoes documentation publication

This repository publishes the documentation at <https://shoes-rs.github.io/>. The complete Starlight project, prose, and canonical configuration examples live in [`cfal/shoes`](https://github.com/cfal/shoes/tree/master/docs). Change documentation alongside configuration code and examples in a Shoes PR; do not copy pages or generated HTML here.

Only **dev** documentation is published for now, at `/`. It is unreleased and may describe features not present in the latest release binary. The header identifies the exact source commit.

## Automatic publication

The workflow checks hourly, at minute 17 UTC, for the newest successful `docs.yml` push run on `cfal/shoes` master. It verifies that run's commit is still on master, checks out the exact SHA, runs `npm ci` and `npm run check` in `docs/`, and deploys the resulting site. The upstream gate is documentation CI, not every Shoes workflow. An upstream lookup, ancestry check, or build failure leaves the current site untouched.

`shoes-ref` controls source selection. It must contain exactly one of these values, followed by a single newline:

- `dev`: follow successful upstream documentation CI automatically (the default).
- A full lowercase 40-character SHA: freeze or roll back development documentation to that exact commit. Review that it is a merged, CI-passing Shoes commit. This does not label it as a stable release.
- `UNSET`: disable future builds and deployments without removing the published site.

Scheduled runs skip the build when the published `deployment.json` records the same Shoes SHA, publishing-repository SHA, and dev channel. Missing or unavailable metadata causes a rebuild. Pushes to `main` and manual runs rebuild even if unchanged, so a workflow change or manual retry can republish. Pull requests test source selection and build, but cannot upload or deploy Pages artifacts. Manual runs deploy only from the default branch.

Keep GitHub Pages set to **GitHub Actions**, with the `github-pages` environment allowing `main`. Only the deploy job receives `pages: write` and `id-token: write`; the source/build jobs remain read-only. No personal access token, cross-repository write permission, or automated pin-update commit is needed.

GitHub schedules may be delayed and are disabled in public repositories after 60 days without repository activity. Check the Actions tab if updates stop; re-enable the workflow and run it manually. For an immediate update, use **Actions > Documentation > Run workflow** on `main`.

## Release versions

Start version archives with the first release containing buildable docs. Keep release builds pinned, move development builds to `/dev/`, and add a header version selector. Base-aware links, per-version search indexes, and a single combined Pages artifact are prerequisites; they are not implemented yet. Do not label current docs as v0.3.6 or another earlier release without a reviewed documentation backport.

Before tagging that first release, publish and verify its documentation. Version labels must describe the selected source, never an inferred `Cargo.toml` version.

## Local checks

Run `node --test scripts/resolve-source.test.mjs` with Node 24 to test source selection without network access. `node scripts/resolve-source.mjs` resolves `shoes-ref` against the public APIs without deploying; outside Actions it only prints the result. Run `actionlint` for workflow validation.

For local documentation work, use a Shoes checkout: run `npm ci` and `npm run check` in its `docs/` directory. There is no local copy of the site source here.
