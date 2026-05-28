call build.cmd

cd ..\external
call external-build.cmd
cd ..\back

cd ..\docker
call docker-build.cmd
cd ..\back

cd ..\electron
call electron-build.cmd
cd ..\back

cd ..\tauri
call tauri-build.cmd
cd ..\back
