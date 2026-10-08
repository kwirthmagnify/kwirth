{{/*
Expand the name of the chart.
*/}}
{{- define "kwirth.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "kwirth.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "kwirth.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "kwirth.labels" -}}
helm.sh/chart: {{ include "kwirth.chart" . }}
{{ include "kwirth.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels. 'app: kwirth' is kept next to the standard pair because it is what the 0.1.x Deployment
selected on, and a Deployment selector is immutable: dropping it would break every upgrade.
*/}}
{{- define "kwirth.selectorLabels" -}}
app: kwirth
app.kubernetes.io/name: {{ include "kwirth.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use. '<fullname>-sa' is the 0.1.x name.
*/}}
{{- define "kwirth.serviceAccountName" -}}
{{- if .Values.kwirth.serviceAccount.create }}
{{- default (printf "%s-sa" (include "kwirth.fullname" .)) .Values.kwirth.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.kwirth.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Service account annotations: the new place merged over the 0.1.x one.
*/}}
{{- define "kwirth.serviceAccountAnnotations" -}}
{{- $legacy := dict }}
{{- if and .Values.kwirth.sa .Values.kwirth.sa.serviceAccount .Values.kwirth.sa.serviceAccount.annotations }}
{{- $legacy = .Values.kwirth.sa.serviceAccount.annotations }}
{{- end }}
{{- merge (deepCopy .Values.kwirth.serviceAccount.annotations) $legacy | toYaml }}
{{- end }}

{{/*
The image reference: a string is taken as it is (the 0.1.x form), otherwise repository:tag with the chart
appVersion as the default tag.
*/}}
{{- define "kwirth.image" -}}
{{- if kindIs "string" .Values.kwirth.image }}
{{- .Values.kwirth.image }}
{{- else }}
{{- printf "%s:%s" .Values.kwirth.image.repository (default .Chart.AppVersion .Values.kwirth.image.tag) }}
{{- end }}
{{- end }}

{{/*
Pull policy: a string image keeps the 0.1.x behaviour (Always), the object says.
*/}}
{{- define "kwirth.imagePullPolicy" -}}
{{- if kindIs "string" .Values.kwirth.image }}
{{- "Always" }}
{{- else }}
{{- default "IfNotPresent" .Values.kwirth.image.pullPolicy }}
{{- end }}
{{- end }}

{{/*
ROOTPATH as the core wants it: empty for the root, otherwise starting with '/'.
*/}}
{{- define "kwirth.rootpath" -}}
{{- $p := default "" .Values.kwirth.config.rootpath }}
{{- if and $p (not (hasPrefix "/" $p)) }}
{{- printf "/%s" $p }}
{{- else }}
{{- $p }}
{{- end }}
{{- end }}

{{/*
The Ingress path: the root path, or '/' when Kwirth is served at the root.
*/}}
{{- define "kwirth.ingressPath" -}}
{{- default "/" (include "kwirth.rootpath" .) }}
{{- end }}

{{/*
KWIRTH_STORE resolved: an explicit path wins; 'etcd' or empty means the cluster, unless persistence is on,
in which case the mount path. Empty output = do not set the variable.
*/}}
{{- define "kwirth.store" -}}
{{- $s := default "" .Values.kwirth.config.store }}
{{- if and $s (ne $s "etcd") }}
{{- $s }}
{{- else if .Values.kwirth.persistence.enabled }}
{{- .Values.kwirth.persistence.mountPath }}
{{- end }}
{{- end }}

{{/*
Read-only mode, as a boolean-ish string ("true" or empty, so templates can just `if` it).
*/}}
{{- define "kwirth.readOnly" -}}
{{- if eq (default "normal" .Values.kwirth.mode) "readonly" }}true{{ end }}
{{- end }}

{{/*
What a chart can do that a plain manifest cannot: refuse to render a combination that would produce a
broken Kwirth.

Read-only means the cluster will not let the core write, and inside Kubernetes the core's own store IS
Secrets and ConfigMaps of its namespace — users, api keys, installed extensions. Without somewhere else
to put them, the install comes up and then cannot keep a single thing: it looks healthy and loses the
admin password on the first restart. There is no sensible default to pick here (a PVC has a size, a
class and a lifetime that are the operator's call), so this stops and says what to set.
*/}}
{{- define "kwirth.validateMode" -}}
{{- $mode := default "normal" .Values.kwirth.mode }}
{{- if not (has $mode (list "normal" "readonly")) }}
{{- fail (printf "kwirth.mode must be 'normal' or 'readonly', got '%s'" $mode) }}
{{- end }}
{{- if include "kwirth.readOnly" . }}
{{- if not (include "kwirth.store" .) }}
{{- fail "kwirth.mode=readonly needs a store outside the cluster: set kwirth.persistence.enabled=true (or kwirth.config.store to a path you mount yourself). Without it the core would try to keep its configuration in Secrets it has no permission to write." }}
{{- end }}
{{- /* Saying both is saying opposite things, and silently picking one would leave somebody believing
       they installed what they did not. */}}
{{- if .Values.kwirth.rbac.clusterAdmin }}
{{- fail "kwirth.rbac.clusterAdmin=true contradicts kwirth.mode=readonly. Pick one." }}
{{- end }}
{{- /* extraRules are appended verbatim, so one write verb there quietly undoes the whole mode. The
       operator may still need extra READS — non-resource URLs, say — and those go through. */}}
{{- range .Values.kwirth.rbac.extraRules }}
{{- range .verbs }}
{{- if not (has . (list "get" "list" "watch")) }}
{{- fail (printf "kwirth.mode=readonly, but kwirth.rbac.extraRules grants the verb '%s'. Only get, list and watch are allowed in this mode." .) }}
{{- end }}
{{- end }}
{{- end }}
{{- end }}
{{- end }}

{{/*
EXITLOG and the users Secret default differently per mode, and only when the operator has not said.
'false' is a value, so nil is told apart with kindIs rather than with emptiness.

  exitLog        — on a crash the core appends to a 'kwirth-secure-log' ConfigMap. Read-only cannot
                   write it, so the attempt is a 403 and a line of noise on every crash.
  users.bootstrap — the core reads the 'kwirth-users' Secret only when its store IS the cluster. With
                   the store on a volume it seeds its own admin, and the Secret becomes a second,
                   stale source of truth for the password.
*/}}
{{- define "kwirth.exitLog" -}}
{{- if kindIs "invalid" .Values.kwirth.config.exitLog }}
{{- if include "kwirth.readOnly" . }}false{{ else }}true{{ end }}
{{- else }}
{{- .Values.kwirth.config.exitLog }}
{{- end }}
{{- end }}

{{- define "kwirth.usersBootstrap" -}}
{{- if kindIs "invalid" .Values.kwirth.users.bootstrap }}
{{- if include "kwirth.readOnly" . }}{{ else }}true{{ end }}
{{- else if .Values.kwirth.users.bootstrap }}true{{ end }}
{{- end }}

{{/*
The container securityContext. In read-only mode a hardened one is the default, because least privilege
is not only RBAC — and it is only a DEFAULT: anything the operator sets wins, whole.

readOnlyRootFilesystem holds because everything the core writes at runtime that is not its store goes to
os.tmpdir(), which is the emptyDir the deployment mounts at /tmp in this mode. runAsNonRoot is left out:
the image declares no USER, and turning it on without checking the volume's ownership first is how an
install stops booting.
*/}}
{{- define "kwirth.containerSecurityContext" -}}
{{- if .Values.kwirth.securityContext }}
{{- toYaml .Values.kwirth.securityContext }}
{{- else if include "kwirth.readOnly" . }}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: ['ALL']
seccompProfile:
  type: RuntimeDefault
{{- end }}
{{- end }}

{{/*
The bootstrap admin's password, resolved ONCE per render.

🔴 The memo is not a flourish. A helper body runs again on every include, so a bare randAlphaNum would
hand the Secret one password and the install notes a different one — and the operator would be left
reading a password that opens nothing. Stashing it on .Values, which every template shares, makes the
first include decide and the rest agree, whatever order they render in.
*/}}
{{- define "kwirth.adminPassword" -}}
{{- if not (hasKey .Values.kwirth.users "_resolved") }}
{{- $_ := set .Values.kwirth.users "_resolved" (default (randAlphaNum 20) .Values.kwirth.users.adminPassword) }}
{{- end }}
{{- index .Values.kwirth.users "_resolved" }}
{{- end }}

{{/*
The bootstrap admin as the core stores it: base64 of the user JSON. An operator who hands over the whole
blob in users.admin keeps full control and nothing here applies.

🔴 The password is stored HASHED, and hashed the way the login compares: bcrypt over the SHA-256 that
the front end sends, not over the clear text — the clear text never leaves the browser. A plain value
here would simply be refused at login; the core used to accept one and no longer does.

htpasswd is sprig's only bcrypt, and it returns '<user>:<hash>', so the name is cut back off. It emits
$2a$ rather than $2b$, which the core accepts along with $2y$ precisely so that hashes made by ordinary
tools work.
*/}}
{{- define "kwirth.adminBlob" -}}
{{- if .Values.kwirth.users.admin }}
{{- .Values.kwirth.users.admin }}
{{- else }}
{{- $hash := htpasswd "x" (include "kwirth.adminPassword" . | sha256sum) | trimPrefix "x:" }}
{{- $user := dict "id" .Values.kwirth.users.adminId "name" .Values.kwirth.users.adminName "password" $hash "resources" "cluster,admin::::" }}
{{- $user | toJson | b64enc }}
{{- end }}
{{- end }}

{{/*
The key the bootstrap user goes under inside the Secret: base64url of the id, no padding.

🔴 Not the id itself. A Secret key may only hold alphanumerics, '-', '_' and '.', and an id is often an
email — one '@' and the API server rejects the whole Secret. The core encodes it the same way
(IdentityService.writeUsers) and re-indexes by the id inside the JSON when it reads, so the key is only
ever a container; what matters is that it is always a legal one.
*/}}
{{- define "kwirth.adminSecretKey" -}}
{{- .Values.kwirth.users.adminId | b64enc | replace "+" "-" | replace "/" "_" | trimAll "=" }}
{{- end }}

{{/*
Whether the install notes should PRINT the password: only when the chart made it up, and only when this
is the first install. On an upgrade the live Secret is rendered back untouched and the password may have
been changed from the UI long ago, so printing anything would be printing a lie.
*/}}
{{- define "kwirth.showAdminPassword" -}}
{{- if and (include "kwirth.usersBootstrap" .) (not .Values.kwirth.users.admin) (not .Values.kwirth.users.adminPassword) }}
{{- if not (lookup "v1" "Secret" .Release.Namespace "kwirth-users") }}true{{ end }}
{{- end }}
{{- end }}

{{/*
Whether the chart renders the env Secret at all. With MASTERKEY moved out of it, it only exists when
there is a license or an SQL password to carry — and a Secret with nothing in it is not worth a
reference the pod would then fail to resolve.
*/}}
{{- define "kwirth.hasEnvSecret" -}}
{{- if and (not .Values.kwirth.existingSecret) (or .Values.kwirth.config.license .Values.kwirth.sql.enabled) }}true{{ end }}
{{- end }}

{{/*
The Secret that holds MASTERKEY, which is kept across uninstalls.
*/}}
{{- define "kwirth.masterkeySecretName" -}}
{{- printf "%s-masterkey" (include "kwirth.fullname" .) }}
{{- end }}

{{/*
MASTERKEY, resolved. A random one on a first install, and THE SAME ONE for ever after.

Changing it is not a configuration change, it is data loss: every access key already handed out stops
validating, and with a filesystem store the configuration stops decrypting — after which the core finds
no users it can read and seeds the default admin again, so a lost install looks like a fresh one. Hence
the order:

  1. what the operator set. Their key, their call, and the only option that is reproducible from the
     chart alone (which is what a GitOps renderer needs).
  2. the live masterkey Secret, so upgrades and reinstalls keep what is already in use.
  3. the MASTERKEY of the live env Secret. This is the migration path: charts before 0.3.0 kept it
     there, so without this step the first upgrade would quietly rotate the key of every existing
     install.
  4. a new random one.
*/}}
{{- define "kwirth.masterkey" -}}
{{- if .Values.kwirth.config.masterkey }}
{{- .Values.kwirth.config.masterkey }}
{{- else }}
{{- $live := lookup "v1" "Secret" .Release.Namespace (include "kwirth.masterkeySecretName" .) }}
{{- $fromLive := "" }}
{{- if and $live $live.data }}
{{- $fromLive = index $live.data "MASTERKEY" | default "" | b64dec }}
{{- end }}
{{- if $fromLive }}
{{- $fromLive }}
{{- else }}
{{- $legacy := lookup "v1" "Secret" .Release.Namespace (include "kwirth.envSecretName" .) }}
{{- $fromLegacy := "" }}
{{- if and $legacy $legacy.data }}
{{- $fromLegacy = index $legacy.data "MASTERKEY" | default "" | b64dec }}
{{- end }}
{{- $fromLegacy | default (randAlphaNum 40) }}
{{- end }}
{{- end }}
{{- end }}

{{/*
The Secret that feeds the sensitive env vars.
*/}}
{{- define "kwirth.envSecretName" -}}
{{- default (printf "%s-env" (include "kwirth.fullname" .)) .Values.kwirth.existingSecret }}
{{- end }}

{{/*
The PVC name.
*/}}
{{- define "kwirth.pvcName" -}}
{{- default (printf "%s-data" (include "kwirth.fullname" .)) .Values.kwirth.persistence.existingClaim }}
{{- end }}

{{/*
Whether a resource found by lookup belongs to this release (so it can be re-rendered without a conflict).
Usage: include "kwirth.ownedByRelease" (dict "obj" $existing "root" $)
*/}}
{{- define "kwirth.ownedByRelease" -}}
{{- $obj := .obj }}
{{- $root := .root }}
{{- if and $obj $obj.metadata $obj.metadata.annotations }}
{{- if eq (index $obj.metadata.annotations "meta.helm.sh/release-name" | default "") $root.Release.Name }}
{{- "true" }}
{{- end }}
{{- end }}
{{- end }}
