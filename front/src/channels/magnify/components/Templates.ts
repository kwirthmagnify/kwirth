export const templates = new Map<string,string>()

templates.set('Pod',`
apiVersion: v1
kind: Pod
metadata:
  name: static-web
  labels:
    role: myrole
spec:
  containers:
    - name: web
      image: nginx
      ports:
        - name: web
          containerPort: 80
          protocol: TCP
`)

templates.set('Deployment',`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.14.2
          ports:
            - containerPort: 80
`)

templates.set('DaemonSet',`
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd-elasticsearch
  namespace: kube-system
  labels:
    k8s-app: fluentd-logging
spec:
  selector:
    matchLabels:
      name: fluentd-elasticsearch
  template:
    metadata:
      labels:
        name: fluentd-elasticsearch
    spec:
      tolerations:
        # this toleration is to have the daemonset runnable on master nodes
        # remove it if your masters can't run pods
        - key: node-role.kubernetes.io/master
          effect: NoSchedule
      containers:
        - name: fluentd-elasticsearch
          image: quay.io/fluentd_elasticsearch/fluentd:v2.5.2
          resources:
            limits:
              memory: 200Mi
            requests:
              cpu: 100m
              memory: 200Mi
          volumeMounts:
            - name: varlog
              mountPath: /var/log
            - name: varlibdockercontainers
              mountPath: /var/lib/docker/containers
              readOnly: true
      terminationGracePeriodSeconds: 30
      volumes:
        - name: varlog
          hostPath:
            path: /var/log
        - name: varlibdockercontainers
          hostPath:
            path: /var/lib/docker/containers
`)

templates.set('StatefulSet',`
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web
spec:
  selector:
    matchLabels:
      app: nginx # has to match .spec.template.metadata.labels
  serviceName: "nginx"
  replicas: 3 # by default is 1
  template:
    metadata:
      labels:
        app: nginx # has to match .spec.selector.matchLabels
    spec:
      terminationGracePeriodSeconds: 10
      containers:
        - name: nginx
          image: registry.k8s.io/nginx-slim:0.8
          ports:
            - containerPort: 80
              name: web
          volumeMounts:
            - name: www
              mountPath: /usr/share/nginx/html
  volumeClaimTemplates:
    - metadata:
        name: www
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: "my-storage-class"
        resources:
          requests:
            storage: 1Gi
`)

templates.set('ReplicaSet',`
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: frontend
  labels:
    app: guestbook
    tier: frontend
spec:
  # modify replicas according to your case
  replicas: 3
  selector:
    matchLabels:
      tier: frontend
  template:
    metadata:
      labels:
        tier: frontend
    spec:
      containers:
        - name: php-redis
          image: gcr.io/google_samples/gb-frontend:v3
`)

templates.set('ReplicationController',`
apiVersion: v1
kind: ReplicationController
metadata:
  name: nginx
spec:
  replicas: 3
  selector:
    app: nginx
  template:
    metadata:
      name: nginx
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx
          ports:
            - containerPort: 80
`)

templates.set('Job',`
apiVersion: batch/v1
kind: Job
metadata:
  name: echo
spec:
  template:
    spec:
      containers:
        - name: echo
          image: busybox
          command: ["echo", "$HOSTNAME"]
      restartPolicy: Never
  backoffLimit: 3
`)

templates.set('CronJob',`
apiVersion: batch/v1
kind: CronJob
metadata:
  name: hello
spec:
  schedule: "*/1 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: hello
              image: busybox
              imagePullPolicy: IfNotPresent
              command:
                - /bin/sh
                - -c
                - date; echo Hello from the Kubernetes cluster
          restartPolicy: OnFailure
`)

templates.set('ConfigMap',`
apiVersion: v1
kind: ConfigMap
metadata:
  name: cmdemo
data:
  # proerties
  value: "1"
  # file-like keys
  other.properties: |
    enemy.types=aliens,monsters
    player.maximum-lives=5
`)

templates.set('Secret',`
apiVersion: v1
kind: Secret
metadata:
  name: sample-secret
data:
  admin: a3dyaXRoIGlzIGZ1bm55IQ==
type: Opaque
`)

templates.set('ResourceQuota',`
apiVersion: v1
kind: ResourceQuota
metadata:
  name: cpu-limit-default
  namespace: default
spec:
  hard:
    limits.cpu: '2'
    limits.memory: '1Gi'
`)

templates.set('LimitRange',`
apiVersion: v1
kind: LimitRange
metadata:
  name: sample-cpu-limit
spec:
  limits:
    - default:
        cpu: 200m
      defaultRequest:
        cpu: 500m
      max:
        cpu: "2"
      min:
        cpu: 100m
      type: Container
`)

templates.set('HorizontalPodAutoscaler',`
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: basic-autoscaler
spec:
  scaleTargetRef:
    kind: Deployment
    name: nginx-dep
    apiVersion: apps/v1
  minReplicas: 1
  maxReplicas: 2
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 80
`)

templates.set('PodDisruptionBudget',`
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: spaceh-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: apache
`)

templates.set('PriorityClass',`
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: basic
description: Basic Priority class.
preemptionPolicy: PreemptLowerPriority
globalDefault: false
value: 5
`)

templates.set('RuntimeClass',`
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: spot
handler: runc
scheduling:
  nodeSelector:
    region: "eu"
  tolerations:
    - key: cpuCount
      value: '8'
      effect: NoSchedule
`)

templates.set('Lease',`
apiVersion: coordination.k8s.io/v1
kind: Lease
metadata:
  name: sample-lease
spec:
  leaseDurationSeconds: 1000
`)

templates.set('MutatingWebhookConfiguration',`
apiVersion: admissionregistration.k8s.io/v1
kind: MutatingWebhookConfiguration
metadata:
  name: sample-mutating
webhooks:
  - name: my.domain.com
    admissionReviewVersions:
      - v1
    clientConfig:
      service:
        namespace: my-namespace
        name: my-webhook
    sideEffects: None
    objectSelector:
      matchLabels:
        app: kwirth
    rules:
      - operations: ["CREATE", "UPDATE"]
        apiGroups: ["*"]
        apiVersions: ["*"]
        resources: ["*"]
        scope: "*"
`)

templates.set('ValidatingWebhookConfiguration',`
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: sample-validating
webhooks:
  - name: my-webhook.example.com
    clientConfig:
      service:
        namespace: kwirth-namespace
        name: kwirth-webhook
    admissionReviewVersions:
      - v1
    matchPolicy: Equivalent
    rules:
      - operations: ["DELETE", "UPDATE"]
        apiGroups: ["*"]
        apiVersions: ["*"]
        resources: ["*"]
    failurePolicy: "Ignore"
    sideEffects: None
`)

templates.set('Service',`
apiVersion: v1
kind: Service
metadata:
  name: kwirth-service
spec:
  selector:
    app: kwirth-app
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80
`)

templates.set('Endpoints',`
apiVersion: v1
kind: Endpoints
metadata:
  name: sample-sp
subsets:
  - addresses:
      - ip: 1.2.3.4
        nodeName: node-01
        targetRef:
          kind: Pod
          namespace: default
          name: node-exporter
    ports:
      - name: metrics
        port: 9100
        protocol: TCP
`)

templates.set('Ingress',`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sample-ingress
spec:
  rules:
    - http:
        paths:
          - path: /static
            pathType: Prefix
            backend:
              service:
                name: apache-service
                port:
                  number: 80
`)

templates.set('IngressClass',`
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: external-ic
spec:
  controller: kwirthmagnify.github.io/sample-ingress-controller
  parameters:
    apiGroup: k8s.example.com
    kind: IngressParameters
    name: external-ic
`)

templates.set('NetworkPolicy',`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: test-network-policy
  namespace: default
spec:
  podSelector:
    matchLabels:
      role: nosql-database
  ingress:
    - ports:
        - protocol: TCP
          port: 27001
      from:
        - ipBlock:
            cidr: 192.168.0.0/8
            except:
              - 192.168.1.0/8
        - namespaceSelector:
            matchLabels:
              project: datawarehouse
        - podSelector:
            matchLabels:
              role: ewact-app
  egress:
    - ports:
        - protocol: TCP
          port: 5978
      to:
        - ipBlock:
            cidr: 10.0.0.0/24
  policyTypes:
    - Ingress
    - Egress
`)

templates.set('PersistentVolumeClaim',`
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Mi
  volumeName: my-local-pv
  storageClassName: local-path
  volumeMode: Filesystem
`)

templates.set('PersistentVolume',`
apiVersion: v1
kind: PersistentVolume
metadata:
  name: my-local-pv
spec:
  capacity:
    storage: 1Gi
  hostPath:
    path: /tmp/mypv
    type: BlockDevice
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: local-path
  volumeMode: Filesystem
`)

templates.set('StorageClass',`
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: my-sc
provisioner: rancher.io/local-path
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
`)

templates.set('ServiceAccount',`
apiVersion: v1
kind: ServiceAccount
metadata:
  name: sample-sa
  namespace: default
`)

templates.set('ClusterRole',`
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: all-cr
rules:
  - verbs:
      - '*'
    apiGroups:
      - '*'
    resources:
      - '*'
`)

templates.set('Role',`
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: sample-role-read-ns
  namespace: default
rules:
  - verbs:
      - get
    apiGroups:
      - '*'
    resources:
      - namespaces
`)

templates.set('ClusterRoleBinding',`
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: sample-crb
subjects:
  - kind: ServiceAccount
    name: sample-sa
    namespace: kwirth
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: sample-cr
`)

templates.set('RoleBinding',`
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: my-rb
  namespace: my-namespace
subjects:
  - kind: ServiceAccount
    name: sample-sa
    namespace: my-namespace
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: sample-role
`)

templates.set('CustomResourceDefinition',`
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: mycrd.kwrith.com
spec:
  group: kwrith.com
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                name:
                  type: string
                replicas:
                  type: integer
  scope: Namespaced
  names:
    plural: crds
    singular: crd
    kind: Crd
`)
