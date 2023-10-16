#!/usr/bin/env sh
# https://stackoverflow.com/questions/43267413/how-to-set-environment-variables-from-env-file
[ ! -f $1 ] || export $(grep -v '^#' $1 | xargs)
node server/main.js
