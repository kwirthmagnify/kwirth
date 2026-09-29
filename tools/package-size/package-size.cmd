for /f "delims=" %f in ('dir /s /b /a-d back.js') do @if %~zf GTR 250000 echo %~ff %~zf
for /f "delims=" %f in ('dir /s /b /a-d front.js') do @if %~zf GTR 250000 echo %~ff %~zf