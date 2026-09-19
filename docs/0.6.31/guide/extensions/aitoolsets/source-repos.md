# IRIA Source Repos (AI toolset)

> **Type:** AI toolset<br>
> **Package:** `@iriaoperae/kwirth-aitoolset-source-repos`<br>
> **Tools:** 2<br>
> **Needs from the host:** source repository credentials (`REPOS`)

## What it does

**Reads the code that is actually running, and says what changed between two deploys.** Two tools: fetch a
source file at a given revision, and compare two revisions.

That is a small package with a large consequence. A stack trace names a file and a line; without this toolset
the model can only guess what is there, and with it the diagnosis can quote the offending code. And when a
service degrades after a deploy, the cluster can say *when* it started but never *what went in* — that answer
lives in the repository, not in Kubernetes.

## The tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| `get_source_file` | read | internal | Fetches the contents of a single source file from a Git repository (GitHub or GitLab) at a specific ref. Use to inspect the actual source behind a crash: read the stack-trace file:line from the logs, then fetch that file at the image build revision (describe_pod.source). Call repeatedly to follow the trace across files until you find the bug. |
| `compare_revisions` | read | internal | Lists the commits and changed files between two revisions. Use to explain a regression that came in with a deploy: compare the build revisions of two rollout revisions and see what actually went in. Patches are off by default. |

## How the bot finds the repo and the revision

Neither tool guesses. The repository and the commit come from the **pod's image annotations** — the OCI
standard `org.opencontainers.image.source` and `org.opencontainers.image.revision`, with
`kwirth.io/source-repo` / `kwirth.io/source-ref` as kwirth's own fallback — and `describe_pod` surfaces them
as `source.repo` / `source.revision`. Stamp those annotations in your build and every pod knows where its own
code lives.

Without the exact revision the model would read `main`, which is almost never what is deployed.

## The two questions it answers

**"What does the code at the crash look like?"** — the chain is `get_pod_logs` for the trace, `describe_pod`
for the build revision, then `get_source_file` for that file at that revision.

**"What came in with this deploy?"** — `get_workload_rollout_history` gives the images of the current and the
previous ReplicaSet revision, `describe_pod` turns each into its build revision, and `compare_revisions`
lists the commits and files between the two. Note that identifying the culprit revision needs no AI at all:
the rollout history and the image digests already do it. What the model adds is **explaining** the diff.

> **The digest is worth knowing about.** `describe_pod` reports both `image` (the tag) and `imageID` (the
> resolved digest). When two rollout revisions carry the same tag but different digests, someone re-pushed a
> mutable tag: a regression with no change in the manifest. The digest proves it, and it is also the safest
> thing to roll back to.

## Configuring credentials

One entry per Git host, so the tools can reach it:

| Field | Meaning |
|---|---|
| **Host** | The **exact hostname**, as it appears in the repository URL: `github.com`, `gitlab.com`, `gitlab.mycompany.com`. It is matched character by character against the host of the repo being read, so a descriptive name (*"our GitLab"*) matches nothing and the bot will answer that it has no credentials for that host. |
| **Type** | GitHub or GitLab. |
| **API base URL** | On-prem only — e.g. `https://gitlab.mycompany.com/api/v4`. Leave empty for the cloud hosts. |
| **Token** | A read-only token, scoped to the repositories the bot may read. |

Where this is configured depends on the channel that uses the toolset — see that channel's own
documentation.

## Big ranges are cut, and the tool says so

A comparison between distant revisions can hold hundreds of files and megabytes of diff, so `compare_revisions`
caps what it returns: **100 commits**, **100 files**, and **20 000 characters of patch in total** (a budget
shared across files, not per file). When anything is cut, the response says `truncated: true` and carries
`totalCommits` / `totalFiles` — how much the range really holds — so the answer can tell you *what* is
missing instead of leaving you with a silently partial picture. Often one of the two lists is complete and
only the other was trimmed.

Patches are **off by default**, and that is deliberate: attributing a regression to a deploy needs the list of
commits, not the diff. The model asks for the patch in a second call, once it knows which file matters.

## When to grant it

When the channel diagnoses application failures rather than infrastructure ones — and especially when its
prompt *asks* for the source. A bot instructed to quote the code behind a crash, but not granted this toolset,
is being asked for something it cannot do. The same goes for efficiency regressions: without this toolset a
bot can tell you a service got more expensive after a deploy, but not why.

## Notes

- It is the **only toolset that talks outside the cluster**, and the only one that needs credentials of
  its own — which is why it is the only one declaring `REPOS`.
- `read` but **`internal`**: source code is not a public artefact, even when the effect is harmless. Neither
  tool ever writes to your repositories.
- The tools do not interpret the code or score the change: they return commits and diffs as the provider gave
  them. Reading meaning into a diff is the model's job, and keeping it out of the tool is what makes the
  result reproducible.

---

← Back to [AI toolsets](index)
