#FROM node:24-alpine3.22

# ── Etapa de preparacion ───────────────────────────────────────────────────────────────────────────
#
# Aqui se resuelven las extensiones bundled y se deja el dist listo. Nada de esta etapa viaja a la
# imagen final salvo lo que se copie explicitamente con --from, y esa es justo la razon de que exista.
#
# El problema que resuelve: los tgz bundled ya vienen comprimidos, asi que pesan lo mismo en cada capa
# donde aparezcan, y borrarlos en una capa POSTERIOR no libera nada — el fichero sigue en la capa del
# COPY. La guia del core (kwirth.tgz, ~22 MB) acababa TRES veces en la imagen: dentro de ./dist, en el
# ./bundle que luego se borraba, y en /usr/kwirth/bundled, que es la unica que se usa. 44 MB de los
# 81 que engordo la imagen en la 0.5.166.
FROM node:24-alpine3.24 AS staging

WORKDIR /staging

# kwirth-bundled.json es la unica fuente de verdad; sus rutas locales (p.ej. docs/kwirth) se resuelven
# RELATIVAS AL MANIFEST, de ahi que el bundle tenga que estar colgando de este mismo directorio.
# Se prepara con 'node build-image.mjs' desde esta carpeta, que es quien trae manifest y script.
COPY kwirth-bundled.json fetch-bundled.mjs ./
COPY bundle ./bundle

RUN node fetch-bundled.mjs kwirth-bundled.json /staging/bundled \
    && rm -rf bundle/docs

# ── Imagen final ───────────────────────────────────────────────────────────────────────────────────
FROM node:24-alpine3.24

LABEL org.opencontainers.image.source=https://github.com/kwirthmagnify/kwirth
LABEL org.opencontainers.image.description="Kwirth image for running Kwirth inside K8s or as a docker container on your favourite CRI or as a Docker Compose observability tool"

WORKDIR /usr/kwirth

COPY package*.json ./

RUN npm install

# dist SIN docs: el back solo lee de ahi el bundle.js, ./front y ./docsify. La guia se sirve desde el
# tgz bundled (DocsManager), nunca desde dist — por eso la etapa de staging la quita.
COPY --from=staging /staging/bundle ./dist
COPY --from=staging /staging/bundled ./bundled

WORKDIR /usr/kwirth/dist

ENV BUNDLED_EXTENSIONS_PATH=/usr/kwirth/bundled
EXPOSE 3883

CMD [ "node", "--expose-gc", "--no-incremental-marking", "bundle.js" ]
