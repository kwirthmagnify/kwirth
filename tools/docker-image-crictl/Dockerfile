# Usamos la versión más reciente de Alpine
FROM alpine:3.23

# Definimos la versión de crictl
ARG CRICTL_VERSION=v1.35.0

# Instalamos dependencias mínimas
RUN apk add --no-cache ca-certificates wget tar

# Descargamos, extraemos y limpiamos en un solo paso para reducir capas
RUN wget https://github.com/kubernetes-sigs/cri-tools/releases/download/${CRICTL_VERSION}/crictl-${CRICTL_VERSION}-linux-amd64.tar.gz \
    && tar -xzf crictl-${CRICTL_VERSION}-linux-amd64.tar.gz -C /usr/local/bin \
    && rm crictl-${CRICTL_VERSION}-linux-amd64.tar.gz \
    && apk del wget tar

# Verificamos que el binario funcione (opcional, ayuda en el build)
RUN crictl --version

ENTRYPOINT ["/usr/local/bin/crictl"]