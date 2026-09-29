@REM md .\build
@REM del .\build\*.* /s /q

@REM xcopy ..\..\back\bundle\*.* .\build /s /y
copy ..\..\version\version.js dist
npm run dist
