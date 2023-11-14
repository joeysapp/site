#!/bin/sh
[ ! -f $1 ] && echo "missing env file" && exit
[ ! -f $1 ] || export $(grep -v '^#' $1 | xargs)
DUMP_FILENAME="latest.dump"
scp \
    "$SITE_DEPLOY_USER@$SITE_DEPLOY_HOST:$SITE_PATH/scripts/postgres/$DUMP_FILENAME" \
    "$SITE_PATH/scripts/postgres/$DUMP_FILENAME"
