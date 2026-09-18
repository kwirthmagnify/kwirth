# Fileman

The **Fileman** plugin is a visual filesystem explorer for all Kubernetes containers. It presents a consolidated, navigable tree of every namespace → pod → container → filesystem path in the cluster, letting you browse, manage, and transfer files without `kubectl cp` or shell access.

**What you can do:**

- Navigate the full filesystem of any running container (image FS and mounted volumes) via a folder tree on the left and a file list on the right.
- **Copy / move** files and folders — both within the same container and across different containers. Kwirth handles the cross-container transfer transparently.
- **Download** files or folders. Folders are packaged as `.tar.gz` automatically.
- **Upload** files from your local machine directly into any container.
- **Rename** and **delete** files and folders via the action toolbar or right-click context menu.
- Switch between **grid** and **list** view; list view shows file size, date, and permissions.

**Setup:** No configuration is required. Select any resource in the resource selector and start the Fileman channel — the navigation tree populates within seconds.

?> Navigation is **lazy**: Fileman only fetches directory contents when you expand them, keeping the initial load fast even on large clusters.

!> When the resource selector includes a large number of namespaces or pods, the initial load of the top-level tree can be slow. Select a specific namespace or pod to speed things up.
