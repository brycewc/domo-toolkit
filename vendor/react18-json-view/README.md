# Vendored `react18-json-view`

This is a committed build artifact, not source. Do not edit `dist/` by hand.

## Why it is here

The extension uses a fork of `react18-json-view` that adds virtualization support
and a `scrollRef` prop, so the consumer owns the scroll container instead of the
package. The fork is not published to npm, and it cannot be consumed as a Yarn
git dependency: Yarn infers a repo's package manager from its lockfile, the fork
carries only a `pnpm-lock.yaml`, and Yarn 4 rejects that with
`Assertion failed: Unsupported workflow`. On top of that the fork's own `dist/`
is gitignored while its entry points point into it, and its build runs from
`prepublishOnly`, which `yarn pack` never invokes.

Pointing at the fork as a sibling checkout (`portal:../react18-json-view`) worked
only on a machine that happened to have it cloned and built next door, which
broke a fresh clone of this repo, including for anyone who forks it. Vendoring
the built output makes the path repo-relative, so the extension installs and
builds anywhere with no sibling checkout and no build step.

Only the ES build ships here. The fork's `dist/cjs` is dropped (nothing consumes
CommonJS), and its type declarations are dropped too, since they reference
`./svgs/*.svg` files the build never emits. The sourcemap is kept because it
embeds all 26 of its sources, so it debugs correctly without the fork present.

## Source

- Repo: https://github.com/brycewc/react18-json-view
- Branch: `virtualization-support`
- Commit: `d8a9335ed92b5a3f4a78f2d0258c3453d3fb1f97`

## Refreshing after a change to the fork

Build the fork, then copy the ES output over. It is a plain copy, with nothing to
rewrite:

```bash
cd ../react18-json-view && pnpm build
cd -
cp ../react18-json-view/dist/es/index.mjs{,.map} vendor/react18-json-view/dist/es/
yarn install   # portal: is a symlink, but re-run so Yarn revalidates the entry
```

Then bump `version` in this directory's `package.json` if the change is worth
distinguishing, and update the commit hash above.
