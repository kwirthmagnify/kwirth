# Tags de cada extensión — propuesta

> Cuelga de [PRD.md](PRD.md). Fuente: los manifests (2026-11-19) — los públicos por tipo (`pub`), el de jfvilas
> (`jfv`) y el privado `marketplace/manifest.json` (`priv`). **128 extensiones**. Las entradas `docs` no van:
> heredan los tags de la extensión que documentan; un pack, los del plugin que incluye.
>
> Punto de partida: la antigua área y categoría de cada una, convertidas en dos tags; a partir de aquí cada
> extensión lleva los que le toquen (agora ya lleva cuatro).

| # | tipo | id | tags | origen |
|---|---|---|---|---|
| 1 | plugin | agora | `ai` `operations` `observability` `sre` `devops` `kubernetes` | priv |
| 2 | plugin | chapete | `ai` `assistant` | jfv |
| 3 | plugin | vllm | `ai` `llm` | priv |
| 4 | homepage | avicii | `ui` `homepage` | pub |
| 5 | homepage | clusterized | `ui` `homepage` | pub |
| 6 | homepage | depeche-mode | `ui` `homepage` | pub |
| 7 | homepage | matrix | `ui` `homepage` | pub |
| 8 | theme | avicii | `ui` `theme` | pub |
| 9 | theme | depeche-mode | `ui` `theme` | pub |
| 10 | theme | iter | `ui` `theme` | priv |
| 11 | theme | matrix | `ui` `theme` | pub |
| 12 | theme | plexus | `ui` `theme` | pub |
| 13 | theme | post-punk | `ui` `theme` | pub |
| 14 | theme | santander | `ui` `theme` | priv |
| 15 | theme | sfy | `ui` `theme` | pub |
| 16 | plugin | mirc | `collaboration` `chat` | pub |
| 17 | plugin | echo | `development` `debug` | pub |
| 18 | plugin | provider-debug | `development` `debug` | pub |
| 19 | plugin | sender-debug | `development` `debug` | pub |
| 20 | sender | console | `integration` `debug` | pub |
| 21 | dce | file-manager | `library` | pub |
| 22 | dce | nettools | `library` `networking` | pub |
| 23 | dce | ssh | `library` | pub |
| 24 | dce | swagger-ui | `library` | pub |
| 25 | dce | three | `library` | pub |
| 26 | dce | xyflow | `library` | pub |
| 27 | aitoolset | playground | `development` `sample` `ai` | pub |
| 28 | dce | sample | `library` `sample` | pub |
| 29 | provider | sample | `development` `sample` | pub |
| 30 | provider | tick | `development` `sample` | pub |
| 31 | aitoolset | source-repos | `development` `source` `ai` | priv |
| 32 | plugin | asteroids | `game` `arcade` | jfv |
| 33 | plugin | depthcharge | `game` `arcade` | jfv |
| 34 | plugin | galaga | `game` `arcade` | priv |
| 35 | plugin | pacman | `game` `arcade` | jfv |
| 36 | plugin | rallyx | `game` `arcade` | jfv |
| 37 | plugin | spectrum | `game` `emulator` | priv |
| 38 | provider | business | `integration` `ingest` | pub |
| 39 | provider | http-pull-push | `integration` `ingest` | pub |
| 40 | provider | kafka | `integration` `ingest` | pub |
| 41 | sender | email-resend | `alert` `notifications` | pub |
| 42 | sender | email-smtp | `alert` `notifications` | pub |
| 43 | sender | file | `integration` | pub |
| 44 | sender | smsapi | `alert` `notifications` | priv |
| 45 | sender | teams | `alert` `notifications` | pub |
| 46 | sender | composite | `integration` `routing` | pub |
| 47 | sender | ratelimit | `integration` `routing` | pub |
| 48 | sender | regex | `integration` `routing` | pub |
| 49 | sender | tee | `integration` `routing` | pub |
| 50 | sender | timed | `integration` `routing` | pub |
| 51 | sender | jira | `integration` `ticketing` | priv |
| 52 | webhook | jira | `integration` `ticketing` | priv |
| 53 | plugin | flightmap | `live-data` `aviation` | jfv |
| 54 | provider | flight-status | `live-data` `aviation` | jfv |
| 55 | plugin | sugarless | `live-data` `health` | priv |
| 56 | provider | sugarless | `live-data` `health` | priv |
| 57 | plugin | v16map | `live-data` `traffic` | jfv |
| 58 | provider | v16 | `live-data` `traffic` | jfv |
| 59 | plugin | webamp | `media` `music` | jfv |
| 60 | plugin | news | `media` `news` | pub |
| 61 | plugin | alert | `observability` `alert` `kubernetes` | pub |
| 62 | provider | events | `observability` `events` `kubernetes` | pub |
| 63 | aitoolset | k8s-observability | `observability` `log` `ai` `kubernetes` | pub |
| 64 | plugin | log | `observability` `log` `kubernetes` | pub |
| 65 | provider | fluentbit | `observability` `log` | priv |
| 66 | provider | syslog | `observability` `log` | pub |
| 67 | sender | datadog | `observability` `log` `integration` | priv |
| 68 | aitoolset | k8s-metrics | `observability` `metrics` `ai` `kubernetes` | pub |
| 69 | plugin | metrics | `observability` `metrics` `kubernetes` | pub |
| 70 | provider | agent-metrics | `observability` `metrics` | priv |
| 71 | provider | metrics | `observability` `metrics` `kubernetes` | pub |
| 72 | plugin | situs | `observability` `networking` `ai` | priv |
| 73 | provider | service-flow | `observability` `networking` `kubernetes` | priv |
| 74 | plugin | iter | `observability` `topology` `ai` `kubernetes` | priv |
| 75 | plugin | topology | `observability` `topology` `kubernetes` | pub |
| 76 | provider | otel | `observability` `traces` | pub |
| 77 | aitoolset | aws-compute | `operations` `cloud` `ai` | priv |
| 78 | aitoolset | aws-compute-ops | `operations` `cloud` `ai` | priv |
| 79 | aitoolset | aws-serverless | `operations` `cloud` `ai` | priv |
| 80 | aitoolset | aws-serverless-ops | `operations` `cloud` `ai` | priv |
| 81 | aitoolset | azure-compute | `operations` `cloud` `ai` | priv |
| 82 | aitoolset | azure-compute-ops | `operations` `cloud` `ai` | priv |
| 83 | dce | aws-auth | `library` `cloud` | priv |
| 84 | provider | aws | `operations` `cloud` | priv |
| 85 | provider | azure | `operations` `cloud` | priv |
| 86 | provider | cloud-config | `operations` `cloud` | priv |
| 87 | aitoolset | suse-fleet | `operations` `gitops` `ai` `kubernetes` | priv |
| 88 | provider | suse-fleet | `operations` `gitops` `kubernetes` | priv |
| 89 | aitoolset | k8s-describe | `operations` `kubernetes` `ai` | pub |
| 90 | aitoolset | k8s-inventory | `operations` `kubernetes` `ai` | pub |
| 91 | aitoolset | k8s-ops | `operations` `kubernetes` `ai` | priv |
| 92 | aitoolset | k8s-secrets | `operations` `kubernetes` `ai` | pub |
| 93 | plugin | fileman | `operations` `kubernetes` | pub |
| 94 | plugin | magnify | `operations` `kubernetes` | pub |
| 95 | plugin | ops | `operations` `kubernetes` | pub |
| 96 | plugin | ianus | `operations` `networking` | priv |
| 97 | plugin | nettools | `operations` `networking` | pub |
| 98 | router | bridge | `operations` `networking` `platform` | jfv |
| 99 | provider | suse-longhorn | `operations` `storage` `kubernetes` | priv |
| 100 | plugin | status | `platform` `health` | pub |
| 101 | plugin | incipit | `platform` `setup` `ai` | priv |
| 102 | provider | validating | `security` `compliance` `kubernetes` | pub |
| 103 | pack | excubitor | `security` `cyber` `ai` `kubernetes` `vm` | priv |
| 104 | plugin | excubitor | `security` `cyber` `ai` `kubernetes` `vm` | priv |
| 105 | idp | entraid | `security` `identity` | priv |
| 106 | idp | github-cloud | `security` `identity` | pub |
| 107 | idp | github-onprem | `security` `identity` | pub |
| 108 | idp | gitlab-cloud | `security` `identity` | pub |
| 109 | idp | gitlab-onprem | `security` `identity` | pub |
| 110 | idp | google | `security` `identity` | pub |
| 111 | login | agora | `security` `login` | priv |
| 112 | login | anonymous | `security` `login` | pub |
| 113 | login | asteroids | `security` `login` | jfv |
| 114 | login | censor | `security` `login` | pub |
| 115 | login | excubitor | `security` `login` | priv |
| 116 | login | iter | `security` `login` | priv |
| 117 | login | magnify | `security` `login` | pub |
| 118 | login | montag | `security` `login` | priv |
| 119 | login | santander | `security` `login` | priv |
| 120 | login | specula | `security` `login` | priv |
| 121 | plugin | trivy | `security` `vulnerabilities` `kubernetes` | pub |
| 122 | provider | trivy | `security` `vulnerabilities` `kubernetes` | pub |
| 123 | sender | script | `sre` `automation` `alert` | pub |
| 124 | plugin | pinocchio | `sre` `incidents` `ai` `kubernetes` | pub |
| 125 | plugin | specula | `sre` `incidents` `ai` `dashboard` | priv |
| 126 | pack | censor | `sre` `log` `ai` `kubernetes` | pub |
| 127 | plugin | censor | `sre` `log` `ai` `kubernetes` | pub |
| 128 | plugin | montag | `sre` `log` `ai` `kubernetes` | priv |
