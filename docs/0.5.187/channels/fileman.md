# Fileman
Fileman is a really easy-to-use file manager for accessing all your filesystems inside a Kubernetes cluster. That is, you can visually manage all the filesystems that exist in your cluster whether they are just image filesystems, PVCs, secrets... With Fileman you will have a consolidated view of all the objects in the cluster and you will use **a navigation tool to view and manage** all your files.

!> When working with a large number of namespaces and/or pods, please be patient with the initial load of objects.

## What for
With Fileman channel you can:

  - Navigate through all your Kubernetes containers/pods/controllers/namespaces and view the contents of the filesystems.
  - You can perform file operations like copy, move, delete or rename.
  - You can copy/move from different source and target containers.
  - You can download and upload items to/from your local machine.

## Features
These are key features of Fileman channel:

  - The navigation is lazy, that is, Fileman channel will ask your cluster for data when you navigate to a specific container or folder.
  - The copy/move feature has two ways of working:
    1. You can copy/move files/folders inside the image filesystem of a specific container (wherever they live in root FS, or in a mounted FS).
    2. You can copy/move files/folders **from a container to a destination container different from the source one**. That is, you can just go to container A, "select" and "copy" a bunch of files, then navigate to container B and paste those files in there. Kwirth will take into account the fact that the source and target reside in a different container and will act accordingly.
  - You can **download files or folders**. When you download folders, Kwirth builds a `.tar.gz` file for your download operation.

## Use
Starting Fileman is **really simple**. Once you have configured your resource selector and added the new channel to the tabs, just go to the tab "Settings" icon and Start the channel. *No configuration is needed*.

When the channel starts the navigation pane shows up, and in just some milliseconds the content will start arriving.

!> Filesystem information can be slow to arrive if your resource selector includes too many objects.

A typical view of Fileman channel is as follows:

![filemanstart](../_media/ch-images/fileman-initial.png ':class=imageclass80')

The navigation pane includes:
 - A folder tree navigation tool on the left.
 - A file list area on the right, that can be configured to be shown as a grid or as a list (select your view on the top-right icon of the navigation pane).

As you navigate, some actions may appear on the navigation pane header, like 'Rename', 'Delete', 'Copy'...

![filemanactions](../_media/ch-images/fileman-actions.png ':class=imageclass80')

These actions are also available when right-clicking an object on the file list. When you right-click an item a context menu appears with actions according to the object selected.

![filemancontextmenu](../_media/ch-images/fileman-contextmenu.png ':class=imageclassCenter :class=imageclass20')

Finally, for having a detailed view of a file or folder, you can switch the file list from 'Grid' to 'List' and back. The 'List' will show file information (length, date...).

![filemangridlist](../_media/ch-images/fileman-gridlist.png ':class=imageclass60')
