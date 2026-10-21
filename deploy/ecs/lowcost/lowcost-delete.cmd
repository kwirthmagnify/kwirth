@echo off
rem Deletes a cloudformation-lowcost.yaml stack, and EVERYTHING in it: the store on EFS, the database (with no
rem final snapshot), the secrets. Asks first. Windows.
rem
rem   lowcost-delete.cmd [stack] [aws profile] [region]
rem
rem   stack        default 'kwirth'
rem   aws profile  default: whatever the AWS CLI uses (AWS_PROFILE, or 'default')
rem   region       default 'eu-west-1'
rem
rem What it does NOT delete: anything created outside the stack, such as the ECR repository the scan runner
rem image was copied to.
rem
rem Errors go through :fail, for the reason given in lowcost-stop.cmd.
setlocal EnableDelayedExpansion

set STACK=%~1
if "%STACK%"=="" set STACK=kwirth
set REGION=%~3
if "%REGION%"=="" set REGION=eu-west-1
set AWSARGS=--region %REGION%
if not "%~2"=="" set AWSARGS=%AWSARGS% --profile %~2

aws cloudformation describe-stacks --stack-name %STACK% %AWSARGS% --query "Stacks[0].StackStatus" --output text
if errorlevel 1 (
    set MSG=stack '%STACK%' not found in %REGION%
    goto :fail
)

echo.
echo This deletes stack '%STACK%' and everything in it: users, settings, extensions and their databases.
echo There is no final snapshot and no way back.
set /p ANSWER=Type the stack name to confirm:
if not "%ANSWER%"=="%STACK%" (
    set MSG=not confirmed, nothing deleted
    goto :fail
)

echo Deleting...
aws cloudformation delete-stack --stack-name %STACK% %AWSARGS%
if errorlevel 1 (
    set MSG=the delete could not be started
    goto :fail
)
echo Waiting for it to be gone (10-15 minutes: the database and the CloudFront distribution are the slow part)...
aws cloudformation wait stack-delete-complete --stack-name %STACK% %AWSARGS%
if errorlevel 1 (
    echo What failed:
    aws cloudformation describe-stack-events --stack-name %STACK% %AWSARGS% --query "StackEvents[?ResourceStatus=='DELETE_FAILED'].[LogicalResourceId,ResourceStatusReason]" --output text
    set MSG=the stack was not fully deleted. Fix what failed and run this again
    goto :fail
)

echo.
echo Deleted. The ECR repository of the scan runner, if you created one, is still there.
endlocal
exit /b 0

:fail
echo ERROR: %MSG%
endlocal
exit /b 1
