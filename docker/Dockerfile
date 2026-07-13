FROM node:24-alpine3.22

LABEL org.opencontainers.image.source=https://github.com/kwirthmagnify/kwirth
LABEL org.opencontainers.image.description="Kwirth image for running Kwirth inside K8s or as a docker container on your favourite CRI or as a Docker Compose observability tool"

WORKDIR /usr/kwirth

COPY package*.json ./

RUN npm install

COPY ./bundle ./dist

# Bundled extensions: run 'node build-image.mjs' (in this folder) to prepare context and build.
# kwirth-bundled.json is the single source of truth; local-path entries (e.g. docs/kwirth) are
# resolved relative to the manifest and copied by fetch-bundled.mjs.
COPY kwirth-bundled.json ./
COPY fetch-bundled.mjs ./
COPY bundle/docs ./bundle/docs/
RUN node fetch-bundled.mjs kwirth-bundled.json /usr/kwirth/bundled \
    && rm kwirth-bundled.json fetch-bundled.mjs \
    && rm -rf bundle/

WORKDIR /usr/kwirth/dist

ENV BUNDLED_EXTENSIONS_PATH=/usr/kwirth/bundled
EXPOSE 3883

CMD [ "node", "--expose-gc", "--no-incremental-marking", "bundle.js" ]
