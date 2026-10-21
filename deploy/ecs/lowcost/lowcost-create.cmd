@echo off
rem Creates a cloudformation-lowcost.yaml stack and waits until it is up. Windows.
rem
rem   lowcost-create.cmd [stack] [aws profile] [region] [ParameterKey=...,ParameterValue=... ...]
rem
rem   stack        default 'kwirth'
rem   aws profile  default: whatever the AWS CLI uses (AWS_PROFILE, or 'default')
rem   region       default 'eu-west-1'
rem   the rest     any parameter of the template, as the AWS CLI takes it, EACH ONE IN DOUBLE QUOTES (cmd splits
rem                arguments at commas and equals signs). For instance:
rem                  "ParameterKey=ScanRunnerImage,ParameterValue=<account>.dkr.ecr.eu-west-1.amazonaws.com/kwirth-scan-runner:0.2.0"
rem                  "ParameterKey=DbInstanceClass,ParameterValue=db.t3.micro"
rem                  "ParameterKey=WithDemo,ParameterValue=false"
rem                Use "" for the profile or the region to keep their default and still pass parameters.
rem
rem Errors go through :fail, for the reason given in lowcost-stop.cmd.
setlocal EnableDelayedExpansion

set STACK=%~1
if "%STACK%"=="" set STACK=kwirth
set REGION=%~3
if "%REGION%"=="" set REGION=eu-west-1
set AWSARGS=--region %REGION%
if not "%~2"=="" set AWSARGS=%AWSARGS% --profile %~2

rem Everything after the third argument is a template parameter. Collected with shift, not 'for %%A in (%*)',
rem which would split them at their commas and equals signs as well.
set TEMPLATE=%~dp0cloudformation-lowcost.yaml
set PARAMS=
:collect
if "%~4"=="" goto :collected
set PARAMS=%PARAMS% %~4
shift /4
goto :collect
:collected
set PARAMARG=
if not "%PARAMS%"=="" set PARAMARG=--parameters %PARAMS%

echo Creating stack '%STACK%' (%REGION%)...
aws cloudformation create-stack --stack-name %STACK% --template-body "file://%TEMPLATE%" --capabilities CAPABILITY_NAMED_IAM %AWSARGS% %PARAMARG% --query StackId --output text
if errorlevel 1 (
    set MSG=the stack could not be created. If it already exists, use lowcost-start.cmd or lowcost-delete.cmd
    goto :fail
)

echo Waiting for it to be complete (10-15 minutes: the database and the CloudFront distribution are the slow part)...
aws cloudformation wait stack-create-complete --stack-name %STACK% %AWSARGS%
if errorlevel 1 (
    echo What failed:
    aws cloudformation describe-stack-events --stack-name %STACK% %AWSARGS% --query "StackEvents[?ResourceStatus=='CREATE_FAILED'].[LogicalResourceId,ResourceStatusReason]" --output text
    set MSG=the stack did not get created. CloudFormation rolls it back; delete it with lowcost-delete.cmd before trying again
    goto :fail
)

set URL=
for /f "usebackq delims=" %%I in (`aws cloudformation describe-stacks --stack-name %STACK% %AWSARGS% --query "Stacks[0].Outputs[?OutputKey=='HttpsUrl'].OutputValue" --output text`) do set URL=%%I
echo.
echo Created: %URL%
echo Kwirth takes a minute or two more to answer. First login: admin / password, and it asks for a new one at
echo once: do it before sharing the URL.
endlocal
exit /b 0

:fail
echo ERROR: %MSG%
endlocal
exit /b 1
