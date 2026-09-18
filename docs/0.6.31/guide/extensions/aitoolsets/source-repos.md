# IRIA Source Repos (AI toolset)

> **Type:** AI toolset<br>
> **Package:** `@iriaoperae/kwirth-aitoolset-source-repos`<br>
> **Tools:** 1<br>
> **Needs from the host:** source repository credentials (`REPOS`)

## What it does

**Reads the code that is actually running.** One tool: fetch a source file from GitHub or GitLab at a
given revision.

That is a small package with a large consequence. A stack trace names a file and a line; without this toolset
the model can only guess what is there, and with it the diagnosis can quote the offending code.

## The tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| `get_source_file` | read | internal | Fetches the contents of a single source file from a Git repository (GitHub or GitLab) at a specific ref. Use to inspect the actual source behind a crash: read the stack-trace file:line from the logs, then fetch that file at the image build revision (describe_pod.source). Call repeatedly to follow the trace across files until you find the bug. |

## When to grant it

When the channel diagnoses application failures rather than infrastructure ones — and especially when its
prompt *asks* for the source. A bot instructed to quote the code behind a crash, but not granted this toolset,
is being asked for something it cannot do.

## Notes

- It is the **only toolset that talks outside the cluster**, and the only one that needs credentials of
  its own — which is why it is the only one declaring `REPOS`.
- Those credentials are configured per channel, with the repositories it may read. See the channel's own
  documentation for where.
- `read` but **`internal`**: source code is not a public artefact, even when the effect is harmless.

---

← Back to [AI toolsets](index)
