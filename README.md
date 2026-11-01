# Shoes documentation publication

This repository publishes the documentation at <https://shoes-rs.github.io/>. The complete Starlight project, prose, and canonical configuration examples live in [`cfal/shoes`](https://github.com/cfal/shoes/tree/master/docs). Change documentation alongside configuration code and examples in a Shoes PR; do not copy pages or generated HTML here.

`shoes-ref` is the exact Shoes commit to build. It is pinned to the merged documentation source. Set it to `UNSET` to disable future builds and deployments; this does not remove an already published site. Any other value must be a lowercase, full 40-character commit SHA with a trailing newline. Invalid pins fail verification.

## First publication and updates

1. Merge the Shoes documentation and example-validation CI. Confirm its `docs/` directory contains `package.json`, `package-lock.json`, and `.node-version`, and that `npm ci` and `npm run check` pass from `docs/` (`check` includes the build).
2. Update `shoes-ref` to the full, reachable Shoes commit SHA that passed CI, replacing the previous pin or `UNSET`. Review the pin update here. Launch with `Unreleased / development` documentation at `/`. Set `SHOES_DOCS_LABEL` in the workflow to an explicit release version only when publishing its matching release commit.
3. In this repository's GitHub Pages settings, select **GitHub Actions** as the build/deployment source. Merge the pin update into the default branch (`main`). The workflow builds the pinned Shoes source and deploys its `docs/dist/` artifact at `/`.

The first cutover order is **merge Shoes docs, pin and publish this site, verify the live pages, then tag releases**. Shoes' new site links will not resolve between the merge and first publication. Do not tag a release containing those links before the site is live.

For later releases, repeat step 2. A Shoes change alone does not silently republish the site. Once a pin is set, pull requests validate the pinned source and build the site but cannot deploy. Manual workflow runs deploy only from the default branch. The workflow reads the public Shoes repository with this repository's read-only token; no personal access token or cross-repository write access is required.

For local documentation work, use a Shoes checkout: run `npm ci` and `npm run check` in its `docs/` directory. There is no local copy of the site source here.
