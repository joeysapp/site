// [ref] https://node-postgres.com/
import pkg from 'pg';
const { Client, Pool, types: pgTypes } = pkg;

// Custom PG type inferrer allows us to read in rows into Objects
// The frontend can also infer types: (Proto.data) -> <Status data />
import { getType, postgresOIDParser } from '../lib/common/types/customTypes.mjs';

import RootEmitter from '../server.js';

import Info from '../lib/common/types/info.mjs';
import what from '../lib/common/utils/what-server.mjs'; import log from '../lib/common/utils/log.mjs';

// [todo] Safety/SQL injections
// https://stackoverflow.com/questions/12316953/insert-text-with-single-quotes-in-postgresql

// [todo] performance
// https://dzone.com/articles/postgresql-connection-pooling-part-4-pgbouncer-vs

// [todo] https://node-postgres.com/apis/client
// Using node.tlssocket for secure SSL connections.
let pool_config = {
  user: 'web',
  database: 'master',
  port: '9002',

  // [ref] https://github.com/brianc/node-pg-types/blob/master/lib/textParsers.js#L138
  // [ref] https://www.postgresql.org/docs/9.5/datatype.html
  types: postgresOIDParser(pgTypes), 

  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,

  // Default behavior is the pool will keep clients open & connected to the backend
  // until idleTimeoutMillis expire for each client and node will maintain a ref
  // to the socket on the client, keeping the event loop alive until all clients are closed
  // after being idle or the pool is manually shutdown with `pool.end()`.
  // Setting `allowExitOnIdle: true` in the config will allow the node event loop to exit
  // as soon as all clients in the pool are idle, even if their socket is still open
  // to the postgres server.  This can be handy in scripts & tests
  // where you don't want to wait for your clients to go idle before your process exits.
  allowExitOnIdle: false,
};

let id, info, pool;
function Database() {
  id = 'Postgres';
  info = new Info({ id });

  // [ref] https://node-postgres.com/apis/pool#new-pool
  pool = new Pool(pool_config);
  info.status.set('online');

  // [ref] https://node-postgres.com/apis/pool#properties
  function getPoolInfo() {
    return {
      // The total number of clients existing within the pool.
      totalCount: pool.totalCount,
      // The number of clients which are not checked out but are currently idle in the pool.
      idleCount: pool.idleCount,
      // The number of queued requests waiting on a client when all clients are checked out.
      // It can be helpful to monitor this number to see if you need to adjust the size of the pool.
      waitingCount: pool.waitingCount,
    };
  }
  info.add(getPoolInfo());

  // Make sure our pool is closed on global SIGINT
  RootEmitter.prependListener('shutdown', function dbShutdown(event) {
    log(id, 'shutdown', 'pool.end()', 'Closing pool');
    pool.end();
  });

  // [ref] https://node-postgres.com/apis/pool#events
  // Whenever the pool establishes a new client connection to the PostgreSQL backend it will
  // emit the connect event with the newly connected client.
  // This presents an opportunity for you to run setup commands on a client.
  pool.on('connect', function(c) {
    // log(id, 'connect');
    // [todo] e.g. client.query('SET DATESTYLE = iso, mdy');
  });

  // Whenever a client is checked out from the pool the pool will emit the acquire event with the client that was acquired.
  pool.on('acquire', function(c) {
    // log(id, 'acquire');
  });

  // Whenever a client is released back into the pool, the pool will emit the release event.
  pool.on('release', function(err, c) {
    // log(id, 'release');
  });

  // Whenever a client is closed & removed from the pool the pool will emit the remove event.
  pool.on('remove', function(c) {
    // log(id, 'remove');
  });

  // [todo] You probably want to add an event listener to the pool to catch background errors.
  //
  // When a client is sitting idly in the pool it can still emit errors because it is connected to a live backend.
  // If the backend goes down or a network partition is encountered all the idle, connected clients in your application
  // will emit an error through the pool's error event emitter.
  // 
  // Just like other event emitters, if a pool emits an error event and no listeners are added,
  // node will emit an uncaught error and potentially crash your node process.
  //
  // [ref] Handling errors: https://stackoverflow.com/a/61686555
  pool.on('error', function(err, c) {
    // log(id, 'error', err);
  });

  return this;
};

const query = async ({ text, values=[], type='Number', opts={} }) => {
  let client, result;
  try {
    log(id, 'query()', text, `as ${type}`);

    client = await pool.connect();
    result = await client.query({ text, values });

    let { rows, fields } = result;

    // [todo] Transducers, have this be right<-- for perf/mem
    // [info] getType uses our PG type inference to create the objects
    return rows.map(r => getType({ type, data: r }));
  } catch (err) {
    log(id, 'query()', 'error', `${what(err)}`);
    // [todo] We could do a rollback if necessary: client.query('rollback');
  } finally {
    if (client) client.release();
  }
}


// [todo] https://node-postgres.com/apis/cursor
// A cursor can be used to efficiently read through large result sets without loading the entire result-set into
// memory ahead of time. It's useful to simulate a 'streaming' style read of data, or exit early from a large result set.
// The cursor is passed to client.query and is dispatched internally in a way very similar to how normal queries are sent,
// but the API it presents for consuming the result set is different.
const cursorQuery = async ({ text, values=[], type='Number', opts={} }) => { }

export default Database;
export { query, cursorQuery };
