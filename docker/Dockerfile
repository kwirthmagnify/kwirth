#FROM node:24-alpine3.22

# ── Staging stage ──────────────────────────────────────────────────────────────────────────────────
#
# This is where the bundled extensions are resolved and the dist is left ready. Nothing from this stage
# travels to the final image except what is explicitly copied with --from, and that is precisely why it
# exists.
#
# The problem it solves: the bundled tgz files already come compressed, so they weigh the same in every
# layer they appear in, and deleting them in a LATER layer frees nothing — the file is still in the
# COPY's layer. The core's guide (kwirth.tgz, ~22 MB) ended up THREE times in the image: inside ./dist,
# in the ./bundle that was then deleted, and in /usr/kwirth/bundled, which is the only one that is used.
# 44 MB of the 81 the image put on in 0.5.166.
FROM node:24-alpine3.24 AS staging

WORKDIR /staging

# kwirth-bundled.json is the only source of truth; its local paths (docs/kwirth, for instance) are
# resolved RELATIVE TO THE MANIFEST, hence the bundle has to hang off this very directory.
# It is prepared with 'node build-image.mjs' from this folder, which is what brings manifest and script.
COPY kwirth-bundled.json fetch-bundled.mjs ./
COPY bundle ./bundle

RUN node fetch-bundled.mjs kwirth-bundled.json /staging/bundled \
    && rm -rf bundle/docs

# ── Final image ────────────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine3.24

LABEL org.opencontainers.image.source=https://github.com/kwirthmagnify/kwirth
LABEL org.opencontainers.image.description="Kwirth image for running Kwirth inside K8s or as a docker container on your favourite CRI or as a Docker Compose observability tool"

WORKDIR /usr/kwirth

COPY package*.json ./

RUN npm install

# dist WITHOUT docs: the back end only reads bundle.js, ./front and ./docsify from there. The guide is
# served from the bundled tgz (DocsManager), never from dist — that is why the staging stage removes it.
COPY --from=staging /staging/bundle ./dist
COPY --from=staging /staging/bundled ./bundled

WORKDIR /usr/kwirth/dist

ENV BUNDLED_EXTENSIONS_PATH=/usr/kwirth/bundled
EXPOSE 3883

CMD [ "node", "--expose-gc", "--no-incremental-marking", "bundle.js" ]
