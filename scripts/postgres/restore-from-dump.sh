#!/bin/sh
[ ! -f $1 ] && echo "missing env file" && exit
[ ! -f $1 ] || export $(grep -v '^#' $1 | xargs)
RESTORE_DB="$pg_database"
DUMP_FILENAME="latest.dump"
DUMP_PATH="$SITE_LOCAL_PATH/scripts/postgres/$DUMP_FILENAME"
# [todo] Having to manually drop the entire database...?
# https://stackoverflow.com/questions/15692508/a-faster-way-to-copy-a-postgresql-database-or-the-best-way
# --data-only
sudo pg_restore \
     --user="$SITE_DEPLOY_USER" \
     --clean \
     --port="$PGPORT" \
     -d "$RESTORE_DB" \
     --jobs=8 \
     $DUMP_PATH
