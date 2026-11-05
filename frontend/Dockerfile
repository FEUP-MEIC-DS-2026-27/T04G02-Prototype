# The output is static, so build on the runner's own architecture for every platform.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG PUBLIC_PROJECTS_API_URL=http://localhost:8011
ARG PUBLIC_PROJECTS_SSE_URL=http://localhost:8012/events
RUN npm run build

FROM nginx:1.28-alpine AS runtime
ENV SHELL_ORIGIN=http://localhost:3000
ENV VA3_ORIGIN=http://localhost:3003
ENV NGINX_ENVSUBST_FILTER=_ORIGIN$
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
