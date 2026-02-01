# Versioning (AgentHive)

This repo uses **SemVer** and **Changesets** for change tracking.

## What is canonical?
- The deployed behavior is the source of truth.
- Git tags mark released versions.

## Workflow
1) Create a feature/fix.
2) Add a changeset:
   ```bash
   npm run changeset
   ```
3) When ready to cut a release:
   ```bash
   npm run version-packages
   git commit -am "chore: version packages"
   git tag vX.Y.Z
   ```

## Notes
- We are not publishing to npm for now; Changesets is used for structured changelogs + consistent version bumps.
