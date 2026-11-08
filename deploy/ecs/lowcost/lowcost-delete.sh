#!/usr/bin/env bash
# Linux equivalent of lowcost-delete.cmd: deletes a cloudformation-lowcost.yaml stack, and EVERYTHING in it:
# the store on EFS, the database (with no final snapshot), the secrets. Asks first.
#
#   lowcost-delete.sh [stack] [aws profile] [region]
#
# What it does NOT delete: anything created outside the stack, such as the ECR repository the scan runner
# image was copied to.
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

aws cloudformation describe-stacks --stack-name "$STACK" "${AWSARGS[@]}" --query "Stacks[0].StackStatus" --output text \
    || fail "stack '$STACK' not found in $REGION"

echo
echo "This deletes stack '$STACK' and everything in it: users, settings, extensions and their databases."
echo "There is no final snapshot and no way back."
read -r -p "Type the stack name to confirm: " ANSWER
[ "$ANSWER" = "$STACK" ] || fail "not confirmed, nothing deleted"

echo "Deleting..."
aws cloudformation delete-stack --stack-name "$STACK" "${AWSARGS[@]}" || fail "the delete could not be started"
echo "Waiting for it to be gone (10-15 minutes: the database and the CloudFront distribution are the slow part)..."
if ! aws cloudformation wait stack-delete-complete --stack-name "$STACK" "${AWSARGS[@]}"; then
    echo "What failed:"
    aws cloudformation describe-stack-events --stack-name "$STACK" "${AWSARGS[@]}" --query "StackEvents[?ResourceStatus=='DELETE_FAILED'].[LogicalResourceId,ResourceStatusReason]" --output text
    fail "the stack was not fully deleted. Fix what failed and run this again"
fi

echo
echo "Deleted. The ECR repository of the scan runner, if you created one, is still there."
