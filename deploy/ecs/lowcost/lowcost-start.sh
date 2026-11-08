#!/usr/bin/env bash
# Linux equivalent of lowcost-start.cmd: resumes a cloudformation-lowcost.yaml stack paused with lowcost-stop.sh:
# the database first, then the load balancer and the services. The URL is the same as before the pause.
#
#   lowcost-start.sh [stack] [aws profile] [region]
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

DB=$(aws cloudformation describe-stacks --stack-name "$STACK" "${AWSARGS[@]}" --query "Stacks[0].Outputs[?OutputKey=='DbInstanceId'].OutputValue" --output text 2>/dev/null)
[ -n "$DB" ] && [ "$DB" != "None" ] || fail "stack '$STACK' not found in $REGION, or it has no DbInstanceId output"

# The database goes first: Kwirth reads its connection settings at startup, and a task started against a
# database that is still booting starts without SQL.
#
# Its state decides what to do, and it is read rather than guessed: RDS refuses to start a database that is
# still STOPPING (a start right after a stop), and that refusal is not "it is already running". A
# transitional state is waited out, up to 30 minutes, and then acted on.
TRIES=0
while :; do
    STATE=$(aws rds describe-db-instances --db-instance-identifier "$DB" "${AWSARGS[@]}" --query "DBInstances[0].DBInstanceStatus" --output text 2>/dev/null)
    case "$STATE" in
        available) break ;;
        stopped)
            echo "Starting the database '$DB'..."
            aws rds start-db-instance --db-instance-identifier "$DB" "${AWSARGS[@]}" --query "DBInstance.DBInstanceStatus" --output text \
                || fail "the database could not be started"
            echo "Waiting for the database to be available (about 5 minutes)..."
            aws rds wait db-instance-available --db-instance-identifier "$DB" "${AWSARGS[@]}" || fail "the database did not become available"
            break ;;
        starting)
            echo "Waiting for the database to be available (about 5 minutes)..."
            aws rds wait db-instance-available --db-instance-identifier "$DB" "${AWSARGS[@]}" || fail "the database did not become available"
            break ;;
        "")        fail "the state of the database '$DB' could not be read" ;;
    esac
    TRIES=$((TRIES + 1))
    [ $TRIES -le 120 ] || fail "the database stayed '$STATE' for 30 minutes"
    [ $TRIES -eq 1 ] && echo "The database is '$STATE': waiting for it to settle before starting it..."
    sleep 15
done
echo "The database is available."

# Every parameter of the template except Paused, kept as it is. A parameter left out of an update-stack goes
# back to its DEFAULT, so this list has to follow the template's: add here any parameter added there (and in
# the .cmd twins).
KEEP=()
for p in ImageTag WithDemo TaskCpu TaskMemory ScanRunnerImage CloudFrontPrefixListId VpcCidr AlbIdleTimeout DbInstanceClass DbAllocatedStorage DbEngineVersion DbStopSchedule DbStopTimezone; do
    KEEP+=("ParameterKey=$p,UsePreviousValue=true")
done

echo "Resuming stack '$STACK' ($REGION)..."
if OUT=$(aws cloudformation update-stack --stack-name "$STACK" --use-previous-template --capabilities CAPABILITY_NAMED_IAM "${AWSARGS[@]}" --parameters ParameterKey=Paused,ParameterValue=false "${KEEP[@]}" 2>&1); then
    echo "Waiting for the load balancer and the services (5-10 minutes)..."
    aws cloudformation wait stack-update-complete --stack-name "$STACK" "${AWSARGS[@]}" \
        || fail "the update did not finish cleanly. Look at the stack events in the CloudFormation console"
elif echo "$OUT" | grep -q "No updates are to be performed"; then
    echo "The stack was already running."
else
    echo "$OUT"
    fail "the stack could not be resumed"
fi

URL=$(aws cloudformation describe-stacks --stack-name "$STACK" "${AWSARGS[@]}" --query "Stacks[0].Outputs[?OutputKey=='HttpsUrl'].OutputValue" --output text)
echo
echo "Running: $URL"
echo "Kwirth itself takes a minute or two more to answer after the stack is complete."
