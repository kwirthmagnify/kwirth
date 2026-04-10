docker rmi kwirth:latest --force
del ..\docker\bundle\*.* /s /q
md  ..\docker\bundle

xcopy ..\front\build\*.* .\dist\front\*.* /s /y
call npm run build
xcopy .\bundle\*.* ..\docker\bundle /s /y

cd ..\docker
call docker-build.cmd
cd ..\back
