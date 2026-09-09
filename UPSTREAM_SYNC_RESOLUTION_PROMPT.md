# Upstream Sync Resolution Prompt

Resolve the open upstream sync PR for `junglesub/Win-CodexBar`.

## Goal

- Preserve the product values, behavior, and intentional deletions of `personal` by default.
- Add every non-overlapping change from `main`.
- If both branches changed the same feature or policy differently, do not decide silently. Ask the developer.
- Preserve normal merge ancestry. Do not squash or rebase.

## Preparation

1. Read the root `AGENTS.md` and `docs/personal/commits-after-main.md`, especially the collision map and suggested merge checklist.
2. Run `git fetch --prune junglesub`.
3. Record the current SHAs of `junglesub/personal`, `junglesub/main`, and `junglesub/sync/upstream`. If the open PR does not target `personal` from `sync/upstream`, stop and report it.
4. Start a normal merge:

   ```powershell
   git checkout -B sync/upstream junglesub/sync/upstream
   git merge junglesub/personal
   ```

5. Review paths changed by both branches, including files Git merged automatically.

## Resolution Rules

- In this merge direction, `ours` is upstream `main` and `theirs` is `personal`.
- Preserve behavior changed only by `personal`.
- Accept features and fixes changed only by `main`.
- When changes in the same file are independent, retain both.
- When both branches implement the same feature differently, ask the developer and include:
  - the file and relevant symbol;
  - the `personal` behavior;
  - the `main` behavior;
  - the available choices and their effects.
- Never apply `--ours` or `--theirs` across the entire repository.

## Intentional Deletions

Treat deletions on `personal` as deliberate product decisions, not as missing upstream content.

- Inspect paths deleted by `personal` since the merge base before accepting additions from `main`.
- Keep only the canonical English `README.md`.
- Keep localized `README.*.md` files deleted, including languages newly added by `main`.
- Do not restore a deleted documentation, workflow, release, or delivery category without explicit developer approval.
- If `main` adds a new file belonging to a category removed by `personal`, delete it from the merge result or ask the developer when the category is ambiguous.

## Personal Policies That Must Be Preserved

- Frontend toolchain: Node.js 20 and `pnpm@10.18.1`. Keep upstream dependency and lockfile updates when they remain compatible with this toolchain.
- Float Bar: three used-percentage slots, per-metric colors, countdowns, and `modelSpecific` as fallback only.
- Float Bar settings: `provider_metrics` notifications and independent background color and opacity.
- Antigravity: summary-first Gemini five-hour and weekly mapping with the legacy fallback.
- Keep updater activation disabled.
- Keep `junglesub` as the current repository identity and `nesszer` as the upstream sync source.
- Keep `personal-release.yml`, `upstream-sync.yml`, and `install-personal.ps1`.
- Do not replace personal release delivery with the upstream CircleCI publisher.
- Ask the developer about policy collisions such as `.github/workflows/pr-check.yml`.

## Decision Gate

If any ambiguous collision remains, resolve only the unambiguous conflicts and stop before committing or pushing. Ask the developer for the missing decisions.

## Verification

After every decision is resolved, verify that no unmerged entries or whitespace conflict markers remain:

```powershell
git diff --check
git diff --name-only --diff-filter=U
git ls-files -u
```

Run focused tests for the changed areas. Do not build the application unless the user explicitly requests it. Do not add dependencies.

If the merge changes documented behavior, update the existing related documentation.

## Commit and Push

Create a normal merge commit. Do not squash, rebase, or amend it.

```powershell
git push junglesub sync/upstream
```

Update the sync PR through the branch push, but do not merge the PR. Route any required GitHub mutation through `scripts/gh-safe.sh` with the exact repository and object binding required by `AGENTS.md`.

## Final Report

Report:

- the important decisions that preserved `personal`;
- the intentional deletions retained, including newly added files removed by category policy;
- the important changes accepted from `main`;
- every overlapping decision confirmed by the developer;
- tests run and their results;
- the merge commit SHA;
- the PR mergeability and check status.
