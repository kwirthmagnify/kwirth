# IRIA Source Repos (AI toolset)

> **Type:** AI toolset<br>
> **Package:** `@iriaoperae/kwirth-aitoolset-source-repos`<br>
> **Tools:** 5<br>
> **Needs from the host:** source repository credentials (`REPOS`)

## What it does

**Reads the code that is actually running, says what changed between two deploys, and finds the code without
guessing where it is.**

That is a small package with a large consequence. A stack trace names a file and a line; without this toolset
the model can only guess what is there, and with it the diagnosis can quote the offending code. And when a
service degrades after a deploy, the cluster can say *when* it started but never *what went in* — that answer
lives in the repository, not in Kubernetes.

The first two tools work when **someone already said the path** — which is the case a stack trace covers.
The other three are for when nobody did, and that matters more than it sounds: with no path to go on, a model
tries one, and **a 404 is indistinguishable from "that file does not exist"**. Stating the second from the
first is how an assistant ends up saying something false about your code, in the same confident tone it uses
for everything else.

## The tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| `get_source_file` | read | internal | Fetches a source file at a given ref. Read the stack-trace file:line from the logs, then fetch that file at the image build revision (`describe_pod.source`). Big files arrive **in chunks** — see below. |
| `compare_revisions` | read | internal | Lists the commits and changed files between two revisions. Use it to explain a regression that came in with a deploy. Patches are off by default, and `path` narrows the file list to one file or directory. |
| `list_repo_tree` | read | internal | Lists the files and directories at a given ref, optionally under one subdirectory. The answer to *"what is even in here?"*, and what keeps the model from inventing paths. |
| `search_code` | read | internal | Finds **where** something is: a symbol, a config key, an error message. ⚠️ On GitHub it cannot search a revision — see below. |
| `get_file_history` | read | internal | The commits that touched **one** file: who, when, and with what message — the full message, which is where the *why* of a change actually lives. |

## How the bot finds the repo and the revision

Neither tool guesses. The repository and the commit come from the **pod's image annotations** — the OCI
standard `org.opencontainers.image.source` and `org.opencontainers.image.revision`, with
`kwirth.io/source-repo` / `kwirth.io/source-ref` as kwirth's own fallback — and `describe_pod` surfaces them
as `source.repo` / `source.revision`. Stamp those annotations in your build and every pod knows where its own
code lives.

Without the exact revision the model would read `main`, which is almost never what is deployed.

## Reading a big file: it arrives in chunks, and says so

A source file is not returned whole. `get_source_file` fills a budget of 20 000 characters and tells you
exactly what it gave you: `fromLine`, `toLine`, `totalLines` and `truncated`. To read on, the model calls
again with `fromLine` set to the previous `toLine + 1`.

This is not a detail. Before Kwirth 0.3.0 of this toolset there was **no way to ask for the rest**: a 65 KB
file arrived cut at 30 %, and anything living in the other 70 % looked, to the model, exactly like something
that is not in the file. The chunking is what turns *"I could not see it all"* into *"let me go and look"*.

Each line comes **prefixed with its absolute number**:

```
 648 | // Parse a repo reference (full URL or 'owner/name')
 649 | const parseRepoRef = (repo: string) => {
```

That prefix is not part of your file — it is stripped when quoting code. It exists because the alternative is
the model *counting* lines, and counting is what makes an assistant report line 29 for something that lives
in line 31.

## 🔴 On GitHub, searching cannot see a revision

GitHub's code search **only indexes the repository's default branch**. There is no parameter to search a tag,
a branch or a commit: ask for one and you get results from the default branch anyway. GitLab, in contrast,
honours the `ref` you pass.

The toolset does not paper over this. Every `search_code` answer carries `searchedRef` and `refHonored`, and
when the requested ref was ignored it also carries a `warning` in plain words, telling the model that the
result says nothing about that revision and that the way to find out is to open the file there.

Why so much insistence: a search that misses on the default branch proves **nothing** about the revision you
are running, and the tempting conclusion — *"it must have been added later"* — is false often enough to be
dangerous. The expected behaviour is that the bot either stays silent on the point or goes and verifies it
with `get_source_file` at the real ref.

Two more limits of GitHub search worth knowing: it needs an actual search term (qualifiers alone are
rejected), it skips files over 384 KB, and it allows **10 searches per minute**.

## Renames: GitHub does not follow them

`get_file_history` returns `followsRenames`. On GitLab it is `true`; on GitHub there is no equivalent, so a
file that was renamed shows a **short history that begins at the rename** — short, plausible, and misleading
if read as *"this file is new"*. The flag is there so the answer can carry the caveat.

## The questions it answers

**"What does the code at the crash look like?"** — the chain is `get_pod_logs` for the trace, `describe_pod`
for the build revision, then `get_source_file` for that file at that revision.

**"Where is this thing?"** — when no stack trace handed over a path: `search_code` to locate the symbol or the
config key, `list_repo_tree` to see what a directory actually holds, and then `get_source_file` to read it.
Three tools instead of three guesses.

**"Who changed this, and why?"** — `get_file_history` on the suspicious file. It returns the **full** commit
message, not just the subject line, which is usually where the reason was written down. For the diff of one
of those commits, `compare_revisions` with that commit as `toRef`, its parent as `fromRef` and the same
`path`.

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
| **Host** | The **exact hostname**, as it appears in the repository URL: `github.com`, `gitlab.com`, `gitlab.mycompany.com`. It is matched character by character against the host of the repo being read, so a descriptive name (*"our GitLab"*) matches nothing — and neither does `https://gitlab.mycompany.com`, because this field is a hostname, **not a URL**: no scheme, no trailing slash. |
| **Type** | GitHub or GitLab. |
| **API base URL** | On-prem only — e.g. `https://gitlab.mycompany.com/api/v4`. **Leave it empty unless the API lives somewhere other than the host**: empty already means `https://<host>/api/v4` for GitLab and `https://api.github.com` for GitHub. It must point at the **API root**: a bare `https://gitlab.mycompany.com/` is the website, not the API, and every call will come back as an HTML login page. |
| **Token** | A read-only token, scoped to the repositories the bot may read. On GitLab it needs **`read_api`**, not just `read_repository`: blob search goes through the API, and with the narrower scope everything works except `search_code`. |

Both of those fields are easy to get wrong, so the errors are written to be read by a human:

- No credential matches → the answer names **the host it looked for** *and* **the hosts you have configured**,
  so a mismatch (`myhost` vs `gitlab.mycompany.com`) is visible at a glance.
- A reply that is not JSON → the answer says the server returned a web page, most likely a login, and points
  at the **API base URL** as the thing to check. It does not say "permission denied", which is the wrong
  diagnosis for a misrouted call and sends you looking at the token for nothing.

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

That second call should carry **`path`**, which narrows the file list to one file or directory. It does not
save a round trip — neither provider can filter a comparison by path, so the filtering happens here — but it
spends the **whole patch budget on the file that matters** instead of handing it out in arrival order and
leaving the interesting one with nothing. Without it, asking for one file's diff across a wide range means a
truncated answer and then two `get_source_file` calls to rebuild it by hand.

The other three tools cap what they return the same way, and say so: **1 000 tree entries**, **50 search
results**, **100 commits of history**. Each answer carries its own total — `totalEntries`, `totalResults` — so
*"this is cut"* can be said as *"you are seeing 1 000 of about 4 100"*.

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
