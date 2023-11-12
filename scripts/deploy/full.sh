#!/usr/bin/env sh
# https://stackoverflow.com/questions/43267413/how-to-set-environment-variables-from-env-file
[ ! -f .env.local ] && echo "missing .env.local for build and upload to deployment" && exit
export $(grep -v '^#' .env.deploy | xargs)
# [ ! -f $1 ] || export $(grep -v '^#' $1 | xargs)
cd "$SITE_LOCAL_PATH"

# Create empty folder deploy-foo123/
TIMESTAMP="$(date +"%Y-%m-%dT%H:%M:%S")"
TMP_FILENAME="tmp-$TIMESTAMP"
TMP_DIR="$SITE_LOCAL_PATH/scripts/deploy/$TMP_FILENAME"
mkdir "$TMP_DIR"
cp ./.env.deploy "$TMP_DIR"

# Server
# [todo] Should we be using tar?
mkdir "$TMP_DIR/server"
cp server/main.js "$TMP_DIR/server/"

mkdir "$TMP_DIR/server/services"
mkdir "$TMP_DIR/server/services/net"
cp "./server/services/net/https-server.js" "$TMP_DIR/server/services/net/"
cp server/services/net/net-socket.js "$TMP_DIR/server/services/net/"

mkdir "$TMP_DIR/server/services/db"
cp server/services/db/index.js "$TMP_DIR/server/services/db/"

mkdir "$TMP_DIR/server/services/oldschool"
cp server/services/oldschool/index.js "$TMP_DIR/server/services/oldschool/"

# Frontend build/cp
mkdir "$TMP_DIR/files"
mkdir "$TMP_DIR/files/public"
cd "$SITE_PATH/frontend-dev"
npm run build
cp -r \
   build/ \
   "$TMP_DIR/files/public/"

# [TODO] Dump the local postgres database as pgdump-foo123

# Zip, upload
zip -r "$TMP_DIR.zip" "$TMP_DIR"
# scp "$TMP_DIR.zip" $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_SITE_PATH/

#.... todo
# ssh $DEPLOY_USER@$DEPLOY_HOST
# ...
# unzip deploy-foo123
