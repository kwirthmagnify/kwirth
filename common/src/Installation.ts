/*
Copyright 2024 Julio Fernandez

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/*
    The identity of a Kwirth installation: the key extensions use to persist, stamp and federate "per
    cluster". Inside Kubernetes it is the uid of the kube-system namespace. Without Kubernetes (ECS, Cloud
    Run, ACI, a bare container) there is no such namespace, so the core derives a stable id from what the
    platform itself offers — nothing has to be configured — and, as a last resort, generates one.
*/

// Where the installation identity came from. Printed at startup, so whoever reads the log knows how
// trustworthy (and how stable) the id is.
enum EInstallationIdSource {
    KUBERNETES = 'kubernetes',              // the uid of the kube-system namespace
    ECS = 'ecs',                            // the ECS task metadata endpoint (cluster ARN + task family)
    CLOUD_RUN = 'cloudrun',                 // the GCP metadata server (project, region) + K_SERVICE
    AZURE_MANAGED_IDENTITY = 'azure-mi',    // the managed identity token (xms_az_rid / xms_mirid claims)
    GENERATED = 'generated'                 // 'uuid:<uuid>' generated once and kept in Kwirth's store
}

interface IInstallationIdentity {
    id: string                      // what goes to clusterInfo.id
    name: string                    // human-readable, for the UI
    source: EInstallationIdSource
}

export { EInstallationIdSource, IInstallationIdentity }
