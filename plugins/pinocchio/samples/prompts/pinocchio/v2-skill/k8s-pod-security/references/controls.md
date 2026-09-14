# Kubernetes Pod Security Controls

Referencia completa de controles para el análisis de seguridad de Pods.
Cada control incluye: qué buscar en el YAML, el riesgo si falta/está mal, y el fix.

---

## § A — Privilegios y capacidades (CRÍTICO)

### A-01 · privileged: true
- **Buscar**: `securityContext.privileged: true` en cualquier contenedor
- **Riesgo**: El contenedor tiene acceso completo al host. Equivale a root en el nodo. Escape trivial.
- **Severidad**: CRÍTICA
- **Fix**: Eliminar o poner `privileged: false`
- **Ref**: CIS 5.2.1

### A-02 · allowPrivilegeEscalation
- **Buscar**: `allowPrivilegeEscalation: true` o campo ausente (default: true en K8s)
- **Riesgo**: Un proceso puede obtener más privilegios que su padre (setuid binaries, sudo, etc.)
- **Severidad**: ALTA
- **Fix**: `allowPrivilegeEscalation: false`
- **Ref**: CIS 5.2.5

### A-03 · runAsRoot / runAsNonRoot
- **Buscar**: `runAsUser: 0`, `runAsNonRoot: false` o campo ausente
- **Riesgo**: El proceso dentro del contenedor corre como UID 0. Si hay escape, el atacante es root en el host.
- **Severidad**: ALTA
- **Fix**: `runAsNonRoot: true` + `runAsUser: 1000` (o mayor)
- **Ref**: CIS 5.2.6, NSA p.28

### A-04 · Linux Capabilities excesivas
- **Buscar**: `capabilities.add` con valores como:
  - `NET_ADMIN`, `SYS_ADMIN`, `SYS_PTRACE`, `SYS_MODULE`, `DAC_OVERRIDE`,
    `DAC_READ_SEARCH`, `SYS_RAWIO`, `SETUID`, `SETGID`, `CHOWN`,
    `CAP_SYS_CHROOT`, `ALL`
- **Riesgo variable por cap**:
  - `SYS_ADMIN` ≈ root en el nodo
  - `NET_ADMIN` → modificar reglas de red, interceptar tráfico
  - `SYS_PTRACE` → leer memoria de otros procesos (credential theft)
  - `SYS_MODULE` → cargar kernel modules (rootkit)
- **Severidad**: CRÍTICA (`ALL`, `SYS_ADMIN`, `SYS_MODULE`) / ALTA (resto)
- **Fix**:
  ```yaml
  securityContext:
    capabilities:
      drop: ["ALL"]
      add: []  # solo añadir lo estrictamente necesario
  ```
- **Ref**: CIS 5.2.7, 5.2.8, 5.2.9

### A-05 · hostPID / hostIPC / hostNetwork
- **Buscar**: `spec.hostPID: true`, `spec.hostIPC: true`, `spec.hostNetwork: true`
- **Riesgo**:
  - `hostPID`: ve y puede señalar procesos del host (kill, ptrace)
  - `hostIPC`: acceso a memoria compartida del host
  - `hostNetwork`: usa el stack de red del nodo (puede escuchar puertos del host, acceder a servicios internos)
- **Severidad**: CRÍTICA
- **Fix**: Eliminar o poner `false`
- **Ref**: CIS 5.2.2, 5.2.3, 5.2.4

### A-06 · seccompProfile ausente
- **Buscar**: Ausencia de `securityContext.seccompProfile` (Pod o contenedor)
- **Riesgo**: Sin seccomp, el contenedor puede hacer cualquier syscall al kernel → mayor superficie de ataque para exploits de kernel
- **Severidad**: MEDIA
- **Fix**:
  ```yaml
  securityContext:
    seccompProfile:
      type: RuntimeDefault  # o Localhost con perfil custom
  ```
- **Ref**: CIS 5.7.2, NSA p.30

### A-07 · AppArmor / SELinux ausente o permissivo
- **Buscar**: Anotación `container.apparmor.security.beta.kubernetes.io/<name>: unconfined`
  o `securityContext.seLinuxOptions` con tipo permissivo
- **Riesgo**: Sin MAC (Mandatory Access Control), un contenedor comprometido tiene libertad total dentro de sus capabilities
- **Severidad**: MEDIA
- **Fix**:
  ```yaml
  # Anotación AppArmor
  annotations:
    container.apparmor.security.beta.kubernetes.io/mycontainer: runtime/default
  ```
- **Ref**: CIS 5.7.3

---

## § B — Identidad y acceso (ALTO)

### B-01 · automountServiceAccountToken no deshabilitado
- **Buscar**: `automountServiceAccountToken: true` o campo ausente (default: true)
- **Riesgo**: El token JWT del ServiceAccount está montado en `/var/run/secrets/kubernetes.io/serviceaccount/token`.
  Si el contenedor se compromete, el atacante tiene acceso autenticado a la API de Kubernetes.
- **Severidad**: ALTA
- **Fix**: `automountServiceAccountToken: false` (a nivel Pod o ServiceAccount)
- **Ref**: CIS 5.1.6

### B-02 · ServiceAccount con permisos excesivos
- **Buscar**: `serviceAccountName` que no sea `default`, o que sea `default` sin restricción
- **Riesgo**: Si el SA tiene ClusterRoleBinding a `cluster-admin` u otros roles amplios, compromiso del Pod = compromiso del cluster
- **Severidad**: ALTA (contextual — requiere revisar el SA externo)
- **Fix**: Principio de mínimo privilegio en RBAC; SA dedicado por workload
- **Nota**: Marcar como INFORMATIVO si no se puede ver el RBAC del SA

### B-03 · runAsGroup no definido
- **Buscar**: Ausencia de `runAsGroup` con `runAsNonRoot: true`
- **Riesgo**: El proceso puede correr con GID 0 (root group) aunque el UID no sea 0
- **Severidad**: BAJA
- **Fix**: `runAsGroup: 1000` (o mayor)

### B-04 · fsGroup no definido
- **Buscar**: Ausencia de `fsGroup` cuando hay volúmenes persistentes
- **Riesgo**: Los archivos creados pueden tener propiedad incorrecta; potencial acceso a archivos de otros procesos
- **Severidad**: BAJA
- **Fix**: `fsGroup: 2000`

---

## § C — Red y exposición (ALTO)

### C-01 · hostPort definido
- **Buscar**: `containers[*].ports[*].hostPort`
- **Riesgo**: Expone el puerto directamente en la IP del nodo. Bypass de NetworkPolicies. Limita scheduling y crea conflictos.
- **Severidad**: MEDIA
- **Fix**: Eliminar `hostPort`; usar Service de tipo ClusterIP + Ingress

### C-02 · NetworkPolicy ausente (inferida)
- **Buscar**: Si no hay referencia a NetworkPolicy y el Pod tiene `hostNetwork: false`
- **Riesgo**: Sin NetworkPolicy, todo Pod puede comunicarse con todo Pod (tráfico este-oeste sin restricción)
- **Severidad**: MEDIA (INFORMATIVO si no tienes visibilidad del namespace)
- **Fix**: Crear NetworkPolicy de deny-all + allowlist explícito

### C-03 · Protocolo no especificado en puertos
- **Buscar**: `ports` sin `protocol` explícito
- **Riesgo**: Ambigüedad; puede abrirse UDP cuando solo se necesita TCP
- **Severidad**: BAJA

---

## § D — Sistema de archivos y volúmenes (MEDIO-ALTO)

### D-01 · readOnlyRootFilesystem: false o ausente
- **Buscar**: `securityContext.readOnlyRootFilesystem: true` ausente o en false
- **Riesgo**: El atacante puede escribir en el filesystem del contenedor (instalar herramientas, modificar binarios, persistencia)
- **Severidad**: MEDIA
- **Fix**: `readOnlyRootFilesystem: true` + `emptyDir` para paths que necesiten escritura

### D-02 · hostPath volumes
- **Buscar**: `volumes[*].hostPath`
- **Riesgo variable**:
  - `/`, `/etc`, `/var`, `/proc`, `/sys` → escape de contenedor, modificación del host
  - `/var/run/docker.sock` o `/run/containerd` → control total del runtime (= root en nodo)
  - Paths arbitrarios → exfiltración de datos del host
- **Severidad**: CRÍTICA (socket del runtime, `/etc`, `/`) / ALTA (otros paths sensibles) / MEDIA (paths específicos de app)
- **Fix**: Eliminar; usar PersistentVolumeClaim. Si es imprescindible, usar `readOnly: true` y path mínimo.
- **Ref**: CIS 5.2.12

### D-03 · Volume con subPath
- **Buscar**: `volumeMounts[*].subPath` o `subPathExpr`
- **Riesgo**: CVE-2021-25741 y similares — path traversal que permite acceder fuera del volumen
- **Severidad**: MEDIA
- **Fix**: Evitar subPath cuando sea posible; mantener K8s actualizado

### D-04 · EmptyDir con medium: Memory sin límite
- **Buscar**: `volumes[*].emptyDir.medium: Memory` sin `sizeLimit`
- **Riesgo**: DoS — el contenedor puede agotar la memoria del nodo
- **Severidad**: MEDIA
- **Fix**: Añadir `sizeLimit`

---

## § E — Imágenes y supply chain (MEDIO)

### E-01 · Tag :latest o sin tag
- **Buscar**: `image: nombre` sin tag, o `image: nombre:latest`
- **Riesgo**: No hay forma de garantizar qué imagen se ejecuta. Una imagen maliciosa podría reemplazarla silenciosamente.
- **Severidad**: MEDIA
- **Fix**: Usar digest SHA256: `image: nginx@sha256:abc123...`

### E-02 · Imagen sin registry específico
- **Buscar**: `image: nginx` (sin registry prefix)
- **Riesgo**: Dependency confusion / typosquatting — K8s puede resolver desde Docker Hub en vez del registry privado
- **Severidad**: MEDIA
- **Fix**: `image: registry.empresa.com/nginx:1.25.3`

### E-03 · Uso de imagen como root (inferido)
- **Buscar**: Imágenes conocidas que corren como root por defecto (nginx oficial, mysql, redis sin config)
  combinado con ausencia de `runAsNonRoot`
- **Riesgo**: Ver A-03
- **Severidad**: ALTA

### E-04 · imagePullPolicy: Never o IfNotPresent sin digest
- **Buscar**: `imagePullPolicy: Never` o ausencia con imagen sin digest
- **Riesgo**: Se puede ejecutar una imagen cacheada antigua con vulnerabilidades conocidas
- **Severidad**: BAJA

---

## § F — Recursos y disponibilidad (MEDIO)

### F-01 · Sin limits de CPU/memoria
- **Buscar**: Ausencia de `resources.limits.cpu` o `resources.limits.memory`
- **Riesgo**: DoS — un contenedor comprometido o buggy puede agotar recursos del nodo (noisy neighbor, OOM killer en otros Pods)
- **Severidad**: MEDIA
- **Fix**:
  ```yaml
  resources:
    requests:
      cpu: "100m"
      memory: "128Mi"
    limits:
      cpu: "500m"
      memory: "512Mi"
  ```
- **Ref**: CIS 5.6.4

### F-02 · Sin requests de CPU/memoria
- **Buscar**: Ausencia de `resources.requests`
- **Riesgo**: El scheduler no puede hacer placement correcto; puede generar nodos OOM
- **Severidad**: BAJA

### F-03 · Sin liveness/readiness probes
- **Buscar**: Ausencia de `livenessProbe` y/o `readinessProbe`
- **Riesgo**: Un contenedor comprometido o en estado zombie continúa recibiendo tráfico
- **Severidad**: BAJA (operacional con implicaciones de seguridad)

---

## § G — Secrets y datos sensibles (ALTO)

### G-01 · Secrets en variables de entorno
- **Buscar**: `env[*].value` con valores que parezcan passwords, tokens, keys, connection strings
  (patrones: `PASSWORD=`, `SECRET=`, `TOKEN=`, `KEY=`, `DSN=`, `CONN_STR=`)
- **Riesgo**: Los valores son visibles en `kubectl describe pod`, en logs, y en la API de K8s sin cifrado adicional
- **Severidad**: ALTA
- **Fix**: Usar `valueFrom.secretKeyRef`; mejor aún, usar un secret store (Vault, AWS SSM) con CSI driver

### G-02 · Secret completo montado como volumen (cuando solo se necesita uno)
- **Buscar**: `volumes[*].secret` que monte todos los keys de un Secret
- **Riesgo**: El contenedor accede a más secrets de los necesarios
- **Severidad**: MEDIA
- **Fix**: Usar `items` para montar solo los keys necesarios; usar `defaultMode: 0400`

### G-03 · Permisos de montaje de secrets demasiado abiertos
- **Buscar**: `volumes[*].secret.defaultMode` > 0400 (ej: 0644, 0777, ausente = 0644 por defecto)
- **Riesgo**: Otros procesos en el contenedor (si hay múltiples) pueden leer el secret
- **Severidad**: BAJA
- **Fix**: `defaultMode: 0400`

### G-04 · ConfigMap con datos sensibles
- **Buscar**: Claves en `env` que referencian ConfigMaps con nombres sugestivos de contener secrets
- **Riesgo**: ConfigMaps no están cifrados en etcd por defecto; son accesibles a cualquiera con `get configmap`
- **Severidad**: MEDIA (INFORMATIVO si no tienes el ConfigMap)

---

## § H — Observabilidad y configuración general (BAJO-MEDIO)

### H-01 · Sin labels de identificación estándar
- **Buscar**: Ausencia de labels recomendados: `app.kubernetes.io/name`, `app.kubernetes.io/version`, `app.kubernetes.io/component`
- **Riesgo**: Dificultad de auditoría, respuesta a incidentes, y aplicación de NetworkPolicies
- **Severidad**: INFORMATIVA

### H-02 · Namespace default
- **Buscar**: `metadata.namespace: default` o ausencia de namespace
- **Riesgo**: Workloads productivos en `default` mezclan con recursos de prueba; dificulta aplicar RBAC y NetworkPolicy granulares
- **Severidad**: BAJA

### H-03 · Sin anotaciones de owner/equipo
- **Buscar**: Ausencia de anotaciones como `owner:`, `team:`, `contact:`
- **Riesgo**: En un incidente, no se puede identificar rápidamente al responsable
- **Severidad**: INFORMATIVA

### H-04 · terminationMessagePolicy no definido
- **Buscar**: Ausencia de `terminationMessagePolicy`
- **Riesgo**: Los mensajes de terminación pueden incluir información sensible logueada por defecto
- **Severidad**: INFORMATIVA

### H-05 · initContainers con privilegios
- **Buscar**: `initContainers[*].securityContext` — aplicar todos los controles A, B, D a init containers también
- **Riesgo**: Los init containers suelen ignorarse en revisiones de seguridad pero tienen acceso al mismo filesystem y red
- **Severidad**: Heredada del control violado

---

## Tabla rápida de severidad por campo

| Campo / Valor | Severidad |
|---|---|
| `privileged: true` | CRÍTICA |
| `hostPID/IPC/Network: true` | CRÍTICA |
| `hostPath: /var/run/docker.sock` | CRÍTICA |
| `capabilities.add: [SYS_ADMIN]` | CRÍTICA |
| `capabilities.add: [ALL]` | CRÍTICA |
| `runAsUser: 0` | ALTA |
| `allowPrivilegeEscalation: true` (explícito) | ALTA |
| `automountServiceAccountToken` sin deshabilitar | ALTA |
| `hostPath` (path genérico) | ALTA |
| Secrets en `env.value` | ALTA |
| `capabilities.add: [NET_ADMIN, SYS_PTRACE, ...]` | ALTA |
| `image: latest` | MEDIA |
| Sin `readOnlyRootFilesystem` | MEDIA |
| Sin `resources.limits` | MEDIA |
| Sin `seccompProfile` | MEDIA |
| `hostPort` definido | MEDIA |
| Sin `runAsGroup` | BAJA |
| Sin probes | BAJA |
| Namespace default | BAJA |
| Sin labels estándar | INFORMATIVA |

---

## Nivel Pod Security Standards

Al final del análisis, determina qué PSS level satisface el Pod y cuál debería satisfacer:

| Campo violado | PSS mínimo requerido |
|---|---|
| `privileged: true` | Privileged (no cumple Baseline) |
| `hostPID/IPC/Network` | Privileged |
| `hostPath` | Privileged (Baseline lo restringe) |
| `capabilities` no permitidas | Baseline |
| `allowPrivilegeEscalation: true` | Baseline (Restricted lo prohíbe) |
| `runAsNonRoot: false` | Restricted lo requiere |
| `seccompProfile` ausente | Restricted lo requiere |

Documenta el gap: "El Pod requiere PSS: Privileged por uso de hostPath. Debería poder operar en Baseline tras eliminar el volumen hostPath."
