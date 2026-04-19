# bb

Reusable XDOES blog + blog editor source package.

## Purpose

`bb` is the source-of-truth repo for the blog listing, blog editor UI, sqlite loading, and GitHub OAuth helper logic used by `node.xdoes.space`.

## Deployment model

Hostinger still auto-builds only the `x-does/node` repo.
This repo is vendored into `node/packages/bb` so the public site keeps a single build/deploy path while blog/editor code lives in its own repo.

## Sync into node

Copy this repo into `node/packages/bb` (excluding `.git`) and commit the vendored update in `node`.

`bb` is the source of truth.
