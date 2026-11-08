#!/usr/bin/env bash
# Linux equivalent of lowcost-create.cmd: creates a cloudformation-lowcost.yaml stack and waits until it is up.
#
#   lowcost-create.sh [stack] [aws profile] [region] [ParameterKey=...,ParameterValue=... ...]
#
#   stack        default 'kwirth'
#   aws profile  default: whatever the AWS CLI uses (AWS_PROFILE, or 'default')
#   region       default 'eu-west-1'
#   the rest     any parameter of the template, as the AWS CLI takes it. For instance:
#                  ParameterKey=ScanRunnerImage,ParameterValue=<account>.dkr.ecr.eu-west-1.amazonaws.com/kwirth-scan-runner:0.2.0
#                  ParameterKey=DbInstanceClass,ParameterValue=db.t3.micro
#                  ParameterKey=WithDemo,ParameterValue=false
#                Use "" for the profile or the region to keep their default and still pass parameters.
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

TEMPLATE="$(cd "$(dirname "$0")" && pwd)/cloudformation-lowcost.yaml"
shift $(( $# < 3 ? $# : 3 ))
PARAMARG=()
[ $# -gt 0 ] && PARAMARG=(--parameters "$@")

echo "Creating stack '$STACK' ($REGION)..."
aws cloudformation create-stack --stack-name "$STACK" --template-body "file://$TEMPLATE" --capabilities CAPABILITY_NAMED_IAM "${AWSARGS[@]}" "${PARAMARG[@]}" --query StackId --output text \
    || fail "the stack could not be created. If it already exists, use lowcost-start.sh or lowcost-delete.sh"

echo "Waiting for it to be complete (10-15 minutes: the database and the CloudFront distribution are the slow part)..."
if ! aws cloudformation wait stack-create-complete --stack-name "$STACK" "${AWSARGS[@]}"; then
    echo "What failed:"
    aws cloudformation describe-stack-events --stack-name "$STACK" "${AWSARGS[@]}" --query "StackEvents[?ResourceStatus=='CREATE_FAILED'].[LogicalResourceId,ResourceStatusReason]" --output text
    fail "the stack did not get created. CloudFormation rolls it back; delete it with lowcost-delete.sh before trying again"
fi

URL=$(aws cloudformation describe-stacks --stack-name "$STACK" "${AWSARGS[@]}" --query "Stacks[0].Outputs[?OutputKey=='HttpsUrl'].OutputValue" --output text)
echo
echo "Created: $URL"
echo "Kwirth takes a minute or two more to answer. First login: admin / password, and it asks for a new one at"
echo "once: do it before sharing the URL."
