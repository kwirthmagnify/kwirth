import React, { useState } from 'react';
import { Collapse, Divider, MenuItem, MenuList } from "@mui/material"
import { BrowserUpdated, ChevronRight, CreateNewFolderTwoTone, DeleteTwoTone, Edit, ExpandMore, ExitToApp, Extension, Factory, FileOpenTwoTone, FolderOpen, Home, ImportExport, Info, Key, Palette, Person, SaveAsTwoTone, SaveTwoTone, Send, Settings } from '../tools/KwirthIcons'

enum MenuDrawerOption {
    NewWorkspace,
    LoadWorkspace,
    SaveWorkspace,
    SaveWorkspaceAs,
    DeleteWorkspace,
    ImportWorkspaces,
    ExportWorkspaces,
    SettingsUser,
    SettingsCluster,
    ManageCluster,
    UserSecurity,
    ApiSecurity,
    ManagePlugins,
    ManageProviders,
    ManageSenders,
    ManageDaemons,
    ManageThemes,
    ManageHomepages,
    UpdateKwirth,
    About,
    Exit
}

interface IMenuDrawerProps {
    optionSelected: (opt:MenuDrawerOption) => void
    uploadSelected: (a:React.ChangeEvent<HTMLInputElement>) => void
    selectedClusterName?: string
    hasClusterScope:boolean
  }

const MenuDrawer: React.FC<IMenuDrawerProps> = (props:IMenuDrawerProps) => {
    const [workspacesOpen, setWorkspacesOpen] = useState(false)
    const [extensionsOpen, setExtensionsOpen] = useState(false)

    const optionSelected = (opt:MenuDrawerOption) => {
        props.optionSelected(opt);
    }

    const selectWorkspace = (opt: MenuDrawerOption) => {
        setWorkspacesOpen(false)
        optionSelected(opt)
    }

    const selectExtension = (opt: MenuDrawerOption) => {
        setExtensionsOpen(false)
        optionSelected(opt)
    }

    const menu=(
        <MenuList sx={{height:'85vh', minWidth: 320}}>
            <MenuItem onClick={() => setWorkspacesOpen(prev => !prev)} sx={{ justifyContent: 'space-between' }}>
                <span><FolderOpen />&nbsp;Workspaces</span>
                {workspacesOpen ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
            </MenuItem>
            <Collapse in={workspacesOpen} timeout="auto" unmountOnExit>
                <MenuList disablePadding>
                    <MenuItem sx={{ pl: 4 }} onClick={() => selectWorkspace(MenuDrawerOption.NewWorkspace)}><CreateNewFolderTwoTone/>&nbsp;New workspace</MenuItem>
                    <MenuItem sx={{ pl: 4 }} onClick={() => selectWorkspace(MenuDrawerOption.LoadWorkspace)}><FileOpenTwoTone/>&nbsp;Load workspace</MenuItem>
                    <MenuItem sx={{ pl: 4 }} onClick={() => selectWorkspace(MenuDrawerOption.SaveWorkspace)}><SaveTwoTone/>&nbsp;Save workspace</MenuItem>
                    <MenuItem sx={{ pl: 4 }} onClick={() => selectWorkspace(MenuDrawerOption.SaveWorkspaceAs)}><SaveAsTwoTone/>&nbsp;Save workspace as...</MenuItem>
                    <MenuItem sx={{ pl: 4 }} onClick={() => selectWorkspace(MenuDrawerOption.DeleteWorkspace)}><DeleteTwoTone/>&nbsp;Delete workspace...</MenuItem>
                    <MenuItem sx={{ pl: 4 }} onClick={() => selectWorkspace(MenuDrawerOption.ExportWorkspaces)}><ImportExport/>&nbsp;Export all workspaces</MenuItem>
                    <MenuItem sx={{ pl: 4 }} component='label'><input type="file" hidden accept=".kwirth.json" onChange={(event) => { setWorkspacesOpen(false); props.uploadSelected(event) }}/><ImportExport/>&nbsp;Import workspaces from file</MenuItem>
                </MenuList>
            </Collapse>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.SettingsUser)}><Settings/>&nbsp;User settings</MenuItem>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.SettingsCluster)} disabled={props.selectedClusterName===undefined}><Settings/>&nbsp;Cluster Settings</MenuItem>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.ManageCluster)}><Edit/>&nbsp;Manage cluster list</MenuItem>
            <Divider/>
            { props.hasClusterScope &&
                <div>
                    <MenuItem onClick={() => optionSelected(MenuDrawerOption.ApiSecurity)}><Key/>&nbsp;API Security</MenuItem>
                    <MenuItem onClick={() => optionSelected(MenuDrawerOption.UserSecurity)}><Person />&nbsp;User security</MenuItem>
                    <MenuItem onClick={() => setExtensionsOpen(prev => !prev)} sx={{ justifyContent: 'space-between' }}>
                        <span><Extension />&nbsp;Manage extensions</span>
                        {extensionsOpen ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
                    </MenuItem>
                    <Collapse in={extensionsOpen} timeout="auto" unmountOnExit>
                        <MenuList disablePadding>
                            <MenuItem sx={{ pl: 4 }} onClick={() => selectExtension(MenuDrawerOption.ManagePlugins)}><Extension />&nbsp;Plugins</MenuItem>
                            <MenuItem sx={{ pl: 4 }} onClick={() => selectExtension(MenuDrawerOption.ManageProviders)}><Factory />&nbsp;Providers</MenuItem>
                            <MenuItem sx={{ pl: 4 }} onClick={() => selectExtension(MenuDrawerOption.ManageSenders)}><Send />&nbsp;Senders</MenuItem>
                            <MenuItem sx={{ pl: 4 }} onClick={() => selectExtension(MenuDrawerOption.ManageDaemons)}><Extension />&nbsp;Daemons</MenuItem>
                            <MenuItem sx={{ pl: 4 }} onClick={() => selectExtension(MenuDrawerOption.ManageThemes)}><Palette />&nbsp;Themes</MenuItem>
                            <MenuItem sx={{ pl: 4 }} onClick={() => selectExtension(MenuDrawerOption.ManageHomepages)}><Home />&nbsp;Homepages</MenuItem>
                        </MenuList>
                    </Collapse>
                    <MenuItem onClick={() => optionSelected(MenuDrawerOption.UpdateKwirth)}><BrowserUpdated />&nbsp;Update Kwirth</MenuItem>
                    <Divider/>
                </div>
            }
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.About)}><Info />&nbsp;About Kwirth...</MenuItem>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.Exit)}><ExitToApp />&nbsp;Exit Kwirth</MenuItem>
        </MenuList>
    )

    return menu
}

export { MenuDrawer, MenuDrawerOption }
