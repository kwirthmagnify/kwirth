# 7. Everyday tasks

This chapter is a set of **step-by-step recipes** for the things people do most often in Kwirth. Each one builds on the [resource selector](04-selecting-resources) and the [channel lifecycle](05-channels), so if a step is unfamiliar, follow the link back.

> In every recipe the pattern is the same: **fill the selector → pick a channel → ADD → gear ▶ Start → configure → read**.

## Watch the logs of a namespace

1. **Cluster** → your cluster · **View** → `namespace` · **Namespace** → tick the namespace(s) · **Channel** → `log` · **ADD**.
2. Tab **gear → Start**.
3. In *Configure log stream*, turn on **Get messages from container start time** (to see history) and keep **Follow new messages** on. **OK**.
4. Use the **Filter** box to zero in; enable **`.*`** for regular expressions.

## Follow a single container's logs

1. **View** → `container`, drill down **Namespace → Controller → Pod → Container**.
2. **Channel** → `log` · **ADD** · **Start**.

This gives you *only* that container's lines — ideal when a pod has several containers and one is misbehaving.

## Build a metrics view

1. **View** → `pod` (or `namespace` for an aggregate) · select your target · **Channel** → `metrics` · **ADD** · **Start**.
2. Configure the metrics/interval you want.
3. Keep this tab and add a **log** tab for the same target, then [save both as a workspace](06-workspaces) called e.g. `myapp-health`.

## Get alerted on error logs

1. Select the scope you care about · **Channel** → `alert` · **ADD** · **Start**.
2. Configure the **pattern(s)** that should raise an alert (for example a regex matching `ERROR|panic`).
3. From now on you are notified when matching lines appear — Kwirth does the matching server-side, so you only receive what you asked for.

See the [Alert manual](../extensions/plugins/alert) for the full pattern options.

## Operate a workload (shell, restart, inspect)

1. Select your target · **Channel** → `ops` · **ADD** · **Start**.
2. Use the Ops actions to **open a shell**, **restart**, or **inspect** the selected objects.

See the [Ops manual](../extensions/plugins/ops).

## Browse a container's files

1. Select your target · **Channel** → `fileman` · **ADD** · **Start**.
2. Navigate the container filesystem and mounted volumes; download or inspect files.

See the [Fileman manual](../extensions/plugins/fileman).

## Check security vulnerabilities

1. Select your scope · **Channel** → `trivy` · **ADD** · **Start**.
2. Review the vulnerability findings surfaced by Trivy.

See the [Trivy manual](../extensions/plugins/trivy).

## Cut through noisy logs

- **Filter box:** type a term (or a regex with **`.*`** enabled) to show only matching lines.
- **Censor channel:** for persistent boilerplate, use the [Censor](../extensions/plugins/censor) channel, which learns patterns and filters routine noise so only meaningful lines remain.

## Save your setup for next time

Once you have the tabs you like open:

1. **☰ → Workspaces → Save workspace as…** and name it.
2. Reload it any time from the Home tab's **Last / Fav workspaces**, or from **☰ → Workspaces → Load workspace**.

See [Workspaces](06-workspaces).

## Switch between clusters

If you manage several clusters, just change the **Cluster** dropdown and build tabs against the new one. See [Selecting what to observe](04-selecting-resources) and, for the admin side, [Cluster management](../admin/06-cluster-management).

---

That completes Part I. If you administer Kwirth, continue with **[Part II — Administering Kwirth](../admin/01-deployment)**.
