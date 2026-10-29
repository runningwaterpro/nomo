# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues on **runningwaterpro/nomo**. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue edit <parent> --add-sub-issue <child>` (`gh` 2.94+), or put `Part of #<parent>` at the top of the child body.
- **Blocking**: native issue dependencies via `gh issue edit <child> --add-blocked-by <blocker>` (`gh` 2.94+); otherwise a `Blocked by: #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: comment the explanation, then `gh issue close <number>`.

## Fork caveat

This clone is a fork: `origin` = `runningwaterpro/nomo`, `upstream` = `nomo-md/nomo`.
`gh-resolved=base` is set on `origin`, so `gh` resolves to the fork inside this directory.
Before the first `gh issue create` of a session, verify with `gh repo view --json nameWithOwner`.
Never file work items into the upstream `nomo-md/nomo` unless they are meant for the original maintainers.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using `gh pr view`, `gh pr diff`, `gh pr comment`, `gh pr edit --add-label`, `gh pr close`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue on the fork.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: one issue labelled `wayfinder:map`. `gh issue create --label wayfinder:map`.
- **Child ticket**: linked as a sub-issue; labels `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Assign the driving dev once claimed.
- **Frontier query**: open children of the map, minus blocked or already-assigned ones; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`.
- **Resolve**: comment the answer, close, then append a context pointer to the map's Decisions-so-far.
