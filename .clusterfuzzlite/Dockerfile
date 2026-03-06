FROM gcr.io/oss-fuzz-base/base-builder-javascript@sha256:24e89bfa5c06c0b628056c019c3838334ea804f51e931c330e3dfaad03fac3af

COPY . $SRC/claude-session-dashboard
WORKDIR $SRC/claude-session-dashboard/apps/web

RUN npm ci

COPY .clusterfuzzlite/build.sh $SRC/build.sh
