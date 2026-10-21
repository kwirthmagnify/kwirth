# Kwirth on ECS at the lowest cost

For a test or low-traffic install. It is the same Kwirth and the same data model as
[`../cloudformation-full-sql.yaml`](../cloudformation-full-sql.yaml) (EFS for the store, RDS PostgreSQL,
the generated `MASTERKEY`), with what costs money for nothing taken out.

| file | what it is |
|---|---|
| [`cloudformation-lowcost.yaml`](cloudformation-lowcost.yaml) | the stack |
| [`lowcost-create.cmd`](lowcost-create.cmd) · [`lowcost-stop.cmd`](lowcost-stop.cmd) · [`lowcost-start.cmd`](lowcost-start.cmd) · [`lowcost-delete.cmd`](lowcost-delete.cmd) | the four everyday operations in one command each, on Windows ([below](#the-scripts-windows)) |
| [`iam-deploy-policy-lowcost.json`](iam-deploy-policy-lowcost.json) | what the deploying identity needs **on top of** [`../iam-deploy-policy-sql.json`](../iam-deploy-policy-sql.json): the demo Lambda, the private ECR repository for the scan runner, and the weekly database stop. A separate policy because the main one is already at AWS's size limit for a managed policy (6144 characters) |

## What changes against full-sql

| what | full-sql | lowcost |
|---|---|---|
| Internet access for the task | NAT gateway (~37 USD/month) | public IP on the task (~4 USD/month); its security group still only lets the load balancer in |
| Task | Fargate | **Fargate Spot** (~70% less). AWS may reclaim it; the service starts another and you see a reconnect |
| URL | `http://…elb.amazonaws.com`, open to anyone | **`https://…cloudfront.net`**, AWS's certificate, no domain to buy. The load balancer only accepts CloudFront |
| Pausing | not possible | `Paused=true` removes the load balancer and the service, keeps everything else |
| Database | runs until you stop it | **stopped every week**, the night from Sunday to Monday, by a schedule (`DbStopSchedule`) |
| Logs | 30 days | 7 days |

## What it costs

Roughly, in eu-west-1, list prices for a whole month (the Spot discount moves):

| | USD/month |
|---|---|
| Kwirth on Spot, 1 vCPU / 2 GB | ~11 |
| Load balancer, and its two public IPs | ~20 + ~7 |
| RDS `db.t4g.micro` + 20 GB | ~16 |
| Public IP of the task | ~4 |
| Secrets, logs | ~2 |
| CloudFront, the database stop schedule, EFS | ~0 |
| **Running** | **~59** |
| + scan runner (the task becomes 2 vCPU / 4 GB) | +~11 |
| + demo workloads | +~6 |
| **Paused**, with the database stopped | **~4** |

Most of a running month is the load balancer, the database and the task. Running it only when you use it
and pausing it the rest brings the real figure close to the paused one plus ~2.5 USD per day it is up.

## The scripts (Windows)

All four take the same first three arguments — stack name (default `kwirth`), AWS CLI profile (default:
whatever the CLI uses) and region (default `eu-west-1`) — and wait until AWS has finished, so when they return
the stack is in the state they say.

| script | what it does |
|---|---|
| `lowcost-create.cmd [stack] [profile] [region] ["ParameterKey=…,ParameterValue=…" …]` | creates the stack, waits, prints the URL. Template parameters go after the region, **each one in double quotes** (cmd splits arguments at commas and equals signs); `""` keeps a default and moves on |
| `lowcost-stop.cmd [stack] [profile] [region]` | pauses it and stops the database |
| `lowcost-start.cmd [stack] [profile] [region]` | starts the database, waits for it, resumes the stack, prints the URL |
| `lowcost-delete.cmd [stack] [profile] [region]` | deletes everything, after you type the stack name |

For example, with the scan runner and a profile of your own:

```bat
lowcost-create.cmd kwirth my-profile "" "ParameterKey=ScanRunnerImage,ParameterValue=<account>.dkr.ecr.eu-west-1.amazonaws.com/kwirth-scan-runner:0.2.0"
lowcost-stop.cmd   kwirth my-profile
lowcost-start.cmd  kwirth my-profile
lowcost-delete.cmd kwirth my-profile
```

Stopping and starting keep every other parameter as it was. They do it by naming each one with
`UsePreviousValue=true` — a parameter left out of an `update-stack` goes back to its default — so the list
inside them follows the template's: a parameter added to the template has to be added there too.

Running them twice is harmless: stopping a paused stack, or starting a running one, says so and carries on.

The rest of this page is the same operations by hand, for Linux and macOS or to see what the scripts do.

## Create

```bash
aws cloudformation create-stack --stack-name kwirth \
  --template-body file://deploy/ecs/lowcost/cloudformation-lowcost.yaml \
  --capabilities CAPABILITY_NAMED_IAM --region eu-west-1
```

Pass `ParameterKey=DbInstanceClass,ParameterValue=db.t3.micro` if AWS answers that no zone has capacity for
`db.t4g.micro`. The URL is the `HttpsUrl` output; CloudFront takes a few minutes more than the rest to be
reachable. The first login is `admin` / `password`, and Kwirth asks for a new one right away — do it before
sharing the URL.

## Pause and resume

**Pause** — the load balancer and the service go, the data and the URL stay; then stop the database, which
CloudFormation cannot do:

```bash
aws cloudformation update-stack --stack-name kwirth --use-previous-template --capabilities CAPABILITY_NAMED_IAM \
  --parameters ParameterKey=Paused,ParameterValue=true \
    ParameterKey=ImageTag,UsePreviousValue=true \
    ParameterKey=DbInstanceClass,UsePreviousValue=true \
    ParameterKey=ScanRunnerImage,UsePreviousValue=true
aws rds stop-db-instance --db-instance-identifier <DbInstanceId output>
```

> ⚠️ Every parameter you do not name in an `update-stack` goes back to its default. Name all the ones you
> changed at creation with `UsePreviousValue=true`, or the scan runner, the database class… are reset.

**Resume** — the database first, then the rest:

```bash
aws rds start-db-instance --db-instance-identifier <DbInstanceId output>
aws rds wait db-instance-available --db-instance-identifier <DbInstanceId output>
aws cloudformation update-stack … ParameterKey=Paused,ParameterValue=false …
```

While paused, the URL answers `502`: CloudFront has nowhere to send the request. That is expected.

## The weekly database stop

A stopped RDS does not stay stopped: **AWS starts it again by itself after seven days**, and it bills from
then on. And a database left running by mistake bills too. So the stack stops it on a schedule
(EventBridge Scheduler calling the RDS API directly — no Lambda, nothing to maintain, free at this volume):

- `DbStopSchedule`, default `cron(0 2 ? * MON *)`: the night from Sunday to Monday, at 02:00 on Monday, in
  `DbStopTimezone` (default `Europe/Madrid`). Empty disables it.
- It stops the database **whether Kwirth is running or not**. If Kwirth is up at that hour, it loses
  its database until somebody starts it again (`aws rds start-db-instance …`); the extensions that use SQL
  say so, the rest of Kwirth goes on.
- If the database is already stopped, the call fails and nothing is retried. That is the expected outcome.

## Demo workloads

`WithDemo`, on by default: so that there is something for Kwirth to find in the account, the stack also
deploys

- a **Lambda function** `<stack>-demo` (Node.js, 128 MB, arm64). Nothing calls it, so it costs nothing;
- an **ECS service** `<stack>-demo`: nginx from ECR Public, on the smallest Fargate Spot size, with no inbound
  traffic at all. ~6 USD/month, most of it the public IP it needs to pull its image.

The ECS one is removed while paused; the Lambda stays. `WithDemo=false` leaves both out.

## The scan runner

`ScanRunnerImage` adds the scan runner (a container with Trivy) as a sidecar of Kwirth, and the task grows to
2 vCPU / 4 GB. Its token is generated into Secrets Manager — the `ScanRunnerTokenSecretArn` output — to type
into the extension's settings.

The image has to be one Fargate can pull **without credentials**, which in practice means an ECR repository
in this same account. Copy it there once, from wherever it is published, and pass its URI:

```powershell
aws ecr create-repository --repository-name kwirth-scan-runner --region eu-west-1
aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.eu-west-1.amazonaws.com
docker tag  <source registry>/kwirth-scan-runner:<version> <account>.dkr.ecr.eu-west-1.amazonaws.com/kwirth-scan-runner:<version>
docker push <account>.dkr.ecr.eu-west-1.amazonaws.com/kwirth-scan-runner:<version>
```

The repository is not part of the stack: deleting the stack leaves it, and its image, in place.

## In another region

`CloudFrontPrefixListId` is the list of CloudFront's addresses in the region, and its default is
eu-west-1's. Elsewhere, read it with

```bash
aws ec2 describe-managed-prefix-lists --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing
```

## Delete

```bash
aws cloudformation delete-stack --stack-name kwirth --region eu-west-1
```

Everything goes, the database included and **without a final snapshot**: in the low-cost template a
snapshot would be storage that keeps billing after everything else is gone. Copy what you want to keep
first.
