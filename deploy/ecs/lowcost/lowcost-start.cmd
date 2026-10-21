@echo off
rem Resumes a cloudformation-lowcost.yaml stack paused with lowcost-stop.cmd: the database first, then the load
rem balancer and the services. Windows. The URL is the same as before the pause.
rem
rem   lowcost-start.cmd [stack] [aws profile] [region]
rem
rem   stack        default 'kwirth'
rem   aws profile  default: whatever the AWS CLI uses (AWS_PROFILE, or 'default')
rem   region       default 'eu-west-1'
rem
rem Errors go through :fail, for the reason given in lowcost-stop.cmd.
setlocal EnableDelayedExpansion

set STACK=%~1
if "%STACK%"=="" set STACK=kwirth
set REGION=%~3
if "%REGION%"=="" set REGION=eu-west-1
set AWSARGS=--region %REGION%
if not "%~2"=="" set AWSARGS=%AWSARGS% --profile %~2
set OUT=%TEMP%\kwirth-lowcost-%RANDOM%.txt

rem usebackq: the query has its own single quotes, which would end a 'command' early.
set DB=
for /f "usebackq delims=" %%I in (`aws cloudformation describe-stacks --stack-name %STACK% %AWSARGS% --query "Stacks[0].Outputs[?OutputKey=='DbInstanceId'].OutputValue" --output text`) do set DB=%%I
if "%DB%"=="" (
    set MSG=stack '%STACK%' not found in %REGION%, or it has no DbInstanceId output
    goto :fail
)

rem The database goes first: Kwirth reads its connection settings at startup, and a task started against a
rem database that is still booting starts without SQL.
rem
rem Its state decides what to do, and it is read rather than guessed: RDS refuses to start a database that is
rem still STOPPING (a start right after a stop), and that refusal is not "it is already running". A
rem transitional state is waited out, up to 30 minutes, and then acted on.
set TRIES=0
:dbstate
set STATE=
for /f "usebackq delims=" %%I in (`aws rds describe-db-instances --db-instance-identifier %DB% %AWSARGS% --query "DBInstances[0].DBInstanceStatus" --output text`) do set STATE=%%I
if "%STATE%"=="available" goto :dbready
if "%STATE%"=="stopped" goto :dbstart
if "%STATE%"=="starting" goto :waitdb
if "%STATE%"=="" (
    set MSG=the state of the database '%DB%' could not be read
    goto :fail
)
set /a TRIES+=1
if %TRIES% gtr 120 (
    set MSG=the database stayed '%STATE%' for 30 minutes
    goto :fail
)
if %TRIES%==1 echo The database is '%STATE%': waiting for it to settle before starting it...
rem ping as the pause: 'timeout' refuses to run when the script's input is not a console.
ping -n 16 127.0.0.1 >nul
goto :dbstate

:dbstart
echo Starting the database '%DB%'...
aws rds start-db-instance --db-instance-identifier %DB% %AWSARGS% --query "DBInstance.DBInstanceStatus" --output text > "%OUT%" 2>&1
if errorlevel 1 (
    type "%OUT%"
    set MSG=the database could not be started
    goto :fail
)

:waitdb
echo Waiting for the database to be available (about 5 minutes)...
aws rds wait db-instance-available --db-instance-identifier %DB% %AWSARGS%
if errorlevel 1 (
    set MSG=the database did not become available
    goto :fail
)

:dbready
echo The database is available.

rem Every parameter of the template except Paused, kept as it is. See lowcost-stop.cmd: this list has to
rem follow the template's.
set KEEP=
for %%P in (ImageTag WithDemo UseSpot TaskCpu TaskMemory ScanRunnerImage CloudFrontPrefixListId VpcCidr AlbIdleTimeout DbInstanceClass DbAllocatedStorage DbEngineVersion DbStopSchedule DbStopTimezone) do set KEEP=!KEEP! ParameterKey=%%P,UsePreviousValue=true

echo Resuming stack '%STACK%' (%REGION%)...
aws cloudformation update-stack --stack-name %STACK% --use-previous-template --capabilities CAPABILITY_NAMED_IAM %AWSARGS% --parameters ParameterKey=Paused,ParameterValue=false %KEEP% > "%OUT%" 2>&1
if not errorlevel 1 goto :waitupdate
findstr /c:"No updates are to be performed" "%OUT%" >nul
if errorlevel 1 (
    type "%OUT%"
    set MSG=the stack could not be resumed
    goto :fail
)
echo The stack was already running.
goto :url

:waitupdate
echo Waiting for the load balancer and the services (5-10 minutes)...
aws cloudformation wait stack-update-complete --stack-name %STACK% %AWSARGS%
if errorlevel 1 (
    set MSG=the update did not finish cleanly. Look at the stack events in the CloudFormation console
    goto :fail
)

:url
set URL=
for /f "usebackq delims=" %%I in (`aws cloudformation describe-stacks --stack-name %STACK% %AWSARGS% --query "Stacks[0].Outputs[?OutputKey=='HttpsUrl'].OutputValue" --output text`) do set URL=%%I
del "%OUT%" 2>nul
echo.
echo Running: %URL%
echo Kwirth itself takes a minute or two more to answer after the stack is complete.
endlocal
exit /b 0

:fail
del "%OUT%" 2>nul
echo ERROR: %MSG%
endlocal
exit /b 1
