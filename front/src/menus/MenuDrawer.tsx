import React from 'react';
import { Divider, MenuItem, MenuList } from "@mui/material"
import { BrowserUpdated, CreateNewFolderTwoTone, DeleteTwoTone, Edit, ExitToApp, Extension, FileOpenTwoTone, ImportExport, Info, Key, Person, SaveAsTwoTone, SaveTwoTone, Settings } from '@mui/icons-material';

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

    const optionSelected = (opt:MenuDrawerOption) => {
        props.optionSelected(opt);
    }

    const menu=(
        <MenuList sx={{height:'85vh'}}>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.NewWorkspace)}><CreateNewFolderTwoTone/>&nbsp;New workspace</MenuItem>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.LoadWorkspace)}><FileOpenTwoTone/>&nbsp;Load workspace</MenuItem>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.SaveWorkspace)}><SaveTwoTone/>&nbsp;Save workspace</MenuItem>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.SaveWorkspaceAs)}><SaveAsTwoTone/>&nbsp;Save workspace as...</MenuItem>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.DeleteWorkspace)}><DeleteTwoTone/>&nbsp;Delete workspace...</MenuItem>
            <Divider/>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.ExportWorkspaces)}><ImportExport/>&nbsp;Export all workspaces (to downloadable file)</MenuItem>
            <MenuItem component='label'><input type="file" hidden accept=".kwirth.json" onChange={(event) => props.uploadSelected(event)}/><ImportExport/>&nbsp;Import new workspaces from file (and merge overwriting)</MenuItem>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.SettingsUser)}><Settings/>&nbsp;User settings</MenuItem>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.SettingsCluster)} disabled={props.selectedClusterName===undefined}><Settings/>&nbsp;Cluster Settings</MenuItem>
            <Divider/>
            <MenuItem onClick={() => optionSelected(MenuDrawerOption.ManageCluster)}><Edit/>&nbsp;Manage cluster list</MenuItem>
            <Divider/>
            { props.hasClusterScope && 
                <div>
                    <MenuItem onClick={() => optionSelected(MenuDrawerOption.ApiSecurity)}><Key/>&nbsp;API Security</MenuItem>
                    <MenuItem onClick={() => optionSelected(MenuDrawerOption.UserSecurity)}><Person />&nbsp;User security</MenuItem>
                    <MenuItem onClick={() => optionSelected(MenuDrawerOption.ManagePlugins)}><Extension />&nbsp;Manage plugins</MenuItem>
                    <MenuItem onClick={() => optionSelected(MenuDrawerOption.ManageProviders)}><Extension />&nbsp;Manage providers</MenuItem>
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
