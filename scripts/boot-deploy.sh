#!/usr/bin/env sh
# https://stackoverflow.com/questions/43267413/how-to-set-environment-variables-from-env-file
[ ! -f .env.deploy ] || export $(grep -v '^#' .env.deploy | xargs)
node server/main.js
