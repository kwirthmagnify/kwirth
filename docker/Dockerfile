FROM node:24-alpine3.22

LABEL org.opencontainers.image.source=https://github.com/kwirthmagnify/kwirth
LABEL org.opencontainers.image.description="Kwirth image for running Kwirth inside K8s or as a docker container on your favourite CRI or as a Docker Compose observability tool"

WORKDIR /usr/kwirth

COPY package*.json ./

RUN npm install

COPY ./bundle ./dist

# Bundled plugins: run 'node build-image.mjs' (in this folder) to prepare context and build.
COPY kwirth-bundled-plugins.json ./
COPY fetch-bundled-plugins.mjs ./
RUN node fetch-bundled-plugins.mjs kwirth-bundled-plugins.json /usr/kwirth/bundled-plugins \
    && rm kwirth-bundled-plugins.json fetch-bundled-plugins.mjs

WORKDIR /usr/kwirth/dist

ENV BUNDLED_PLUGINS_PATH=/usr/kwirth/bundled-plugins
EXPOSE 3883

CMD [ "node", "--expose-gc", "--no-incremental-marking", "bundle.js" ]
