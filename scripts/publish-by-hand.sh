#!/usr/bin/env bash
# Publish a released tag to npm from this machine, then trust release.yml to publish the next ones.
#
# Needed once: npm only offers a trusted publisher (web UI or `npm trust`) for a package that exists.
# After that a v* tag publishes from CI (release.yml) and this script is not used again.
#
# Usage: scripts/publish-by-hand.sh [tag]     (default v0.1.0, the first release)
# Needs: `npm login` as a member of @entur, 2FA on the account (npm asks for it on publish and on trust),
#        npm >= 11.15 for `npm trust`.
#
# The tag is checked out in a temporary worktree, so this checkout is never touched; `private` is
# dropped from package.json there only, since the tag predates the PR that removes it.
set -euo pipefail

PKG=@entur/iteru-3dbus REPO=entur/iteru-3dbus WORKFLOW=release.yml
TAG=${1:-v0.1.0} VER=${TAG#v}

die() { echo "publish-by-hand: $*" >&2; exit 1; }

user=$(npm whoami 2>/dev/null) || die "not logged in: run npm login"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || die "no tag $TAG (git fetch --tags?)"
npm view "$PKG@$VER" version >/dev/null 2>&1 && die "$PKG@$VER is already on npm"

dir=$(mktemp -d)
trap 'git worktree remove --force "$dir"' EXIT
git worktree add -q --detach "$dir" "$TAG"
cd "$dir"

[[ $(node -p "require('./package.json').version") == "$VER" ]] || die "$TAG is not version $VER in package.json"

npm ci
npm pkg delete private
npm publish --access public --dry-run      # prepack builds dist-lib/; read the file list

read -rp "Publish $PKG@$VER to npm as $user? Public, and only undone within 72 h. [y/N] " ok
[[ $ok == y ]] || die "stopped before publishing"
npm publish --access public

# the package exists now: let release.yml publish by OIDC, no token anywhere
npm trust github "$PKG" --repo "$REPO" --file "$WORKFLOW" --allow-publish
npm trust list "$PKG"
