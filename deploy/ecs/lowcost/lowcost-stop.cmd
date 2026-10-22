@echo off
rem Pauses a cloudformation-lowcost.yaml stack: the load balancer and the services go, the data and the URL
rem stay, and the database is stopped. Windows. Run lowcost-start.cmd to bring it back.
rem
rem   lowcost-stop.cmd [stack] [aws profile] [region]
rem
rem   stack        default 'kwirth'
rem   aws profile  default: whatever the AWS CLI uses (AWS_PROFILE, or 'default')
rem   region       default 'eu-west-1'
rem
rem Errors go through :fail. An 'exit /b 1' inside nested parentheses loses its exit code in cmd, and a script
rem that fails while reporting success is worse than one that does not run.
setlocal EnableDelayedExpansion

set STACK=%~1
if "%STACK%"=="" set STACK=kwirth
set REGION=%~3
if "%REGION%"=="" set REGION=eu-west-1
set AWSARGS=--region %REGION%
if not "%~2"=="" set AWSARGS=%AWSARGS% --profile %~2
set OUT=%TEMP%\kwirth-lowcost-%RANDOM%.txt

rem Every parameter of the template except Paused, kept as it is. A parameter left out of an update-stack goes
rem back to its DEFAULT, so this list has to follow the template's: add here any parameter added there.
set KEEP=
for %%P in (ImageTag WithDemo TaskCpu TaskMemory ScanRunnerImage CloudFrontPrefixListId VpcCidr AlbIdleTimeout DbInstanceClass DbAllocatedStorage DbEngineVersion DbStopSchedule DbStopTimezone) do set KEEP=!KEEP! ParameterKey=%%P,UsePreviousValue=true

echo Pausing stack '%STACK%' (%REGION%)...
aws cloudformation update-stack --stack-name %STACK% --use-previous-template --capabilities CAPABILITY_NAMED_IAM %AWSARGS% --parameters ParameterKey=Paused,ParameterValue=true %KEEP% > "%OUT%" 2>&1
if not errorlevel 1 goto :waitupdate
rem Already paused is not a failure: CloudFormation answers that there is nothing to update.
findstr /c:"No updates are to be performed" "%OUT%" >nul
if errorlevel 1 (
    type "%OUT%"
    set MSG=the stack could not be paused
    goto :fail
)
echo The stack was already paused.
goto :database

:waitupdate
echo Waiting for the load balancer and the services to go (5-10 minutes)...
aws cloudformation wait stack-update-complete --stack-name %STACK% %AWSARGS%
if errorlevel 1 (
    set MSG=the update did not finish cleanly. Look at the stack events in the CloudFormation console
    goto :fail
)

:database
rem usebackq: the query has its own single quotes, which would end a 'command' early.
set DB=
for /f "usebackq delims=" %%I in (`aws cloudformation describe-stacks --stack-name %STACK% %AWSARGS% --query "Stacks[0].Outputs[?OutputKey=='DbInstanceId'].OutputValue" --output text`) do set DB=%%I
if "%DB%"=="" (
    set MSG=the stack has no DbInstanceId output
    goto :fail
)

rem The state decides what to do, read rather than guessed: RDS refuses to stop a database that is still
rem STARTING (a stop right after a start), and that refusal does not mean it is not running. A transitional
rem state is waited out, up to 30 minutes, and then acted on.
set TRIES=0
:dbstate
set STATE=
for /f "usebackq delims=" %%I in (`aws rds describe-db-instances --db-instance-identifier %DB% %AWSARGS% --query "DBInstances[0].DBInstanceStatus" --output text`) do set STATE=%%I
if "%STATE%"=="stopped" (
    echo The database is already stopped.
    goto :done
)
if "%STATE%"=="stopping" (
    echo The database is already stopping.
    goto :done
)
if "%STATE%"=="available" goto :dbstop
if "%STATE%"=="" (
    set MSG=the state of the database '%DB%' could not be read
    goto :fail
)
set /a TRIES+=1
if %TRIES% gtr 120 (
    set MSG=the database stayed '%STATE%' for 30 minutes
    goto :fail
)
if %TRIES%==1 echo The database is '%STATE%': waiting for it to settle before stopping it...
rem ping as the pause: 'timeout' refuses to run when the script's input is not a console.
ping -n 16 127.0.0.1 >nul
goto :dbstate

:dbstop
echo Stopping the database '%DB%'...
aws rds stop-db-instance --db-instance-identifier %DB% %AWSARGS% --query "DBInstance.DBInstanceStatus" --output text > "%OUT%" 2>&1
if errorlevel 1 (
    type "%OUT%"
    set MSG=the database could not be stopped
    goto :fail
)
type "%OUT%"

:done
del "%OUT%" 2>nul
echo.
echo Paused. The URL answers 502 until lowcost-start.cmd. AWS starts a stopped database by itself after seven
echo days; the stack's weekly schedule stops it again.
endlocal
exit /b 0

:fail
del "%OUT%" 2>nul
echo ERROR: %MSG%
endlocal
exit /b 1
