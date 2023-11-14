#!/bin/sh
[ ! -f $1 ] && echo "missing $1 (which should be .env.deploy)" && exit
[ ! -f $1 ] || export $(grep -v '^#' $1 | xargs)

printf "Dumping..."
RESTORE_DB="$pg_database"
DUMP_TIME=$(date +"%Y-%m-%dT%H:%M:%S")
DUMP_FILENAME="$SITE_DEPLOY_PATH/scripts/postgres/$DUMP_TIME.dump"
touch $DUMP_FILENAME
echo " dumped db=$pg_database out to $DUMP_FILENAME and latest.dump"

sudo chown $pg_user $DUMP_FILENAME
sudo -i -u $pg_user pg_dump -Fc -Z 9 --file=$DUMP_FILENAME $pg_database

sudo chown $SITE_DEPLOY_USER $DUMP_FILENAME
cp $DUMP_FILENAME "$SITE_DEPLOY_PATH/scripts/postgres/latest.dump"
