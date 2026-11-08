#!/usr/bin/env bash
# Linux equivalent of lowcost-stop.cmd: pauses a cloudformation-lowcost.yaml stack: the load balancer and the
# services go, the data and the URL stay, and the database is stopped. Run lowcost-start.sh to bring it back.
#
#   lowcost-stop.sh [stack] [aws profile] [region]
set -uo pipefail

STACK="${1:-kwirth}"
PROFILE="${2:-}"
REGION="${3:-eu-west-1}"
AWSARGS=(--region "$REGION")
[ -n "$PROFILE" ] && AWSARGS+=(--profile "$PROFILE")

fail() {
    echo "ERROR: $*"
    exit 1
}

# Every parameter of the template except Paused, kept as it is. A parameter left out of an update-stack goes
# back to its DEFAULT, so this list has to follow the template's: add here any parameter added there (and in
# the .cmd twins).
KEEP=()
for p in ImageTag WithDemo TaskCpu TaskMemory ScanRunnerImage CloudFrontPrefixListId VpcCidr AlbIdleTimeout DbInstanceClass DbAllocatedStorage DbEngineVersion DbStopSchedule DbStopTimezone; do
    KEEP+=("ParameterKey=$p,UsePreviousValue=true")
done

echo "Pausing stack '$STACK' ($REGION)..."
if OUT=$(aws cloudformation update-stack --stack-name "$STACK" --use-previous-template --capabilities CAPABILITY_NAMED_IAM "${AWSARGS[@]}" --parameters ParameterKey=Paused,ParameterValue=true "${KEEP[@]}" 2>&1); then
    echo "Waiting for the load balancer and the services to go (5-10 minutes)..."
    aws cloudformation wait stack-update-complete --stack-name "$STACK" "${AWSARGS[@]}" \
        || fail "the update did not finish cleanly. Look at the stack events in the CloudFormation console"
elif echo "$OUT" | grep -q "No updates are to be performed"; then
    # Already paused is not a failure: CloudFormation answers that there is nothing to update.
    echo "The stack was already paused."
else
    echo "$OUT"
    fail "the stack could not be paused"
fi

DB=$(aws cloudformation describe-stacks --stack-name "$STACK" "${AWSARGS[@]}" --query "Stacks[0].Outputs[?OutputKey=='DbInstanceId'].OutputValue" --output text 2>/dev/null)
[ -n "$DB" ] && [ "$DB" != "None" ] || fail "the stack has no DbInstanceId output"

# The state decides what to do, read rather than guessed: RDS refuses to stop a database that is still
# STARTING (a stop right after a start), and that refusal does not mean it is not running. A transitional
# state is waited out, up to 30 minutes, and then acted on.
TRIES=0
while :; do
    STATE=$(aws rds describe-db-instances --db-instance-identifier "$DB" "${AWSARGS[@]}" --query "DBInstances[0].DBInstanceStatus" --output text 2>/dev/null)
    case "$STATE" in
        stopped)   echo "The database is already stopped."; break ;;
        stopping)  echo "The database is already stopping."; break ;;
        available)
            echo "Stopping the database '$DB'..."
            aws rds stop-db-instance --db-instance-identifier "$DB" "${AWSARGS[@]}" --query "DBInstance.DBInstanceStatus" --output text \
                || fail "the database could not be stopped"
            break ;;
        "")        fail "the state of the database '$DB' could not be read" ;;
    esac
    TRIES=$((TRIES + 1))
    [ $TRIES -le 120 ] || fail "the database stayed '$STATE' for 30 minutes"
    [ $TRIES -eq 1 ] && echo "The database is '$STATE': waiting for it to settle before stopping it..."
    sleep 15
done

echo
echo "Paused. The URL answers 502 until lowcost-start.sh. AWS starts a stopped database by itself after seven"
echo "days; the stack's weekly schedule stops it again."
