call build.cmd

cd ..\deploy\external
call external-build.cmd
cd ..\..\back

cd ..\docker
call docker-build.cmd
cd ..\back

cd ..\deploy\electron
call electron-build.cmd
cd ..\..\back

cd ..\deploy\tauri
call tauri-build.cmd
cd ..\..\back
