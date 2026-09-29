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
