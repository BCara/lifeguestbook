# Branching

## Recommendation

Make **`main`** the default branch on GitHub, created from `codex/launch`.
`codex/launch` holds the launch code; the current default,
`claude/upbeat-gauss-90aokl`, is the older MVP and is already fully contained
in `codex/launch` (it is an ancestor), so nothing is lost.

From then on:

- `main` is always deployable; CI (`.github/workflows/ci.yml`) must be green.
- Work happens on short-lived branches cut from `main` (`launch/*`, `fix/*`,
  `feat/*`) and lands through a pull request.

## Steps on GitHub (owner)

Do these after the `launch/*` branches have been merged into `codex/launch`
(or retarget their PRs to `main` once it exists).

1. **Create `main`** — on github.com/BCara/lifeguestbook open the branch
   dropdown, pick `codex/launch`, type `main` in the box and choose
   *Create branch: main from codex/launch*.
   (Or locally: `git push origin origin/codex/launch:refs/heads/main`.)
2. **Make it the default** — *Settings → General → Default branch*, click the
   switch icon, pick `main`, *Update*, confirm.
3. **Protect it** — *Settings → Branches → Add branch ruleset* (or *Add rule*)
   for `main`: require a pull request before merging, require the `check` (CI workflow)
   status check to pass, block force pushes and deletion.
4. **Retarget open PRs** — any PR still pointing at `codex/launch` or
   `claude/upbeat-gauss-90aokl`: *Edit* next to the title, change base to `main`.
5. **Update local clones**:
   ```bash
   git fetch origin --prune
   git switch -c main origin/main   # or: git switch main && git reset --hard origin/main
   git remote set-head origin -a
   ```
6. **Clean up local worktrees** whose work is already in `codex/launch`:
   `git worktree list`, then `git worktree remove <path>` for each.

## Branches that can be deleted afterwards

Delete via *Code → Branches* (trash icon) only after `main` exists and is the
default.

| Branch | Why it can go |
| --- | --- |
| `claude/upbeat-gauss-90aokl` | Old MVP; fully contained in `codex/launch` / `main`. |
| `claude/focused-clarke-012s57` | Same commits as the old MVP; fully contained in `codex/launch`. |
| `codex/launch` | Identical to `main` once created; delete after all PRs are retargeted. |
| `launch/*` | Each one once its PR is merged (enable *Automatically delete head branches* in *Settings → General* to do this for you). |

**Keep (or archive) `claude/modest-hawking-4ic716`.** It is *not* contained in
`codex/launch`: it carries an unrelated "Bert Creations Studio" experiment
(`bertcreations/`). If it is still wanted, move it to its own repository or
tag it before deleting, e.g. `git push origin origin/claude/modest-hawking-4ic716:refs/tags/archive/bert-creations-studio`.

To double-check any branch before deleting it:

```bash
git merge-base --is-ancestor origin/<branch> origin/main && echo "safe to delete"
```
