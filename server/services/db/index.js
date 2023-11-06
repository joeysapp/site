// Function that creates a postgres client pool and allows access to a running postgres instance
// [ref] https://node-postgres.com/

// [todo] Safety/SQL injections
// https://stackoverflow.com/questions/12316953/insert-text-with-single-quotes-in-postgresql

// [todo] performance
// https://dzone.com/articles/postgresql-connection-pooling-part-4-pgbouncer-vs

// [todo] https://node-postgres.com/apis/client
// Using node.tlssocket for secure SSL connections.

import pkg from 'pg';
const { Client, Pool, types: pgTypes } = pkg;

// Custom PG type inferrer allows us to read in rows into Objects
// The frontend can also infer types: (Proto.data) -> <Status data />
import { postgresOIDParser } from '../../../common/types/customTypes.mjs';
import { RootEmitter } from '../index.js';
import { Info } from '../../../common/types/index.mjs';
import { what, log as _log, fg, bold } from '../../../common/utils/index.mjs';

// import * as queries from './queries-javascript-functions.js';

let pool_config = {
  user: 'node_pool' || process.env.pg_user, 
  password: 'node_pool',
  database: 'node_frontend_db' || process.env.pg_database,
  port: 5432 || process.env.pg_port, 

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


let pool = null;
// const globalDatabase = new Database();
// _log('db', 'init');
// let info = await globalDatabase.getInfo();
// globalDatabase.info.add(info);
// export default globalDatabase;

export default function Database() {
  let id = 'Database';
  let info = new Info({ id, queries: 0 });  

  function log(a='', b='', c='', d='', e='', f='') {
    _log(id, a, b, c, d, e, f);
  };
  log('init');

  // [ref] https://node-postgres.com/apis/pool#new-pool
  // Hmm. So since we're never doing new Database anywhere, 
  // this is called when the first used query is fired, right? That doesn't seem super ideal..
  if (pool === null) {
    pool = new Pool(pool_config);
    info.status.set('online');
    // Make sure our pool is closed on global SIGINT
    RootEmitter.prependListener('shutdown', function dbShutdown(event) {
      log('shutdown', 'pool.end()');
      pool.end();
      pool = null;
    });
  }

  // [ref] https://node-postgres.com/apis/pool#properties
  async function getInfo() {
    let tables = await getTables();
    let uptime = await getUptime();
    info.add({
      tables,
      uptime,
      poolTotalCount: pool.totalCount,
      poolIdleCount: pool.idleCount,
      poolWaitingCount: pool.waitingCount,
    });
  }

  RootEmitter.on(['db', 'query'].join('/'), async function(proto = {}, sock) {
    let { data = '', method, URI, opCode } = proto;

    // Method is largely post for now
    let { queryString = '', options = {} } = JSON.parse(data);

    if (data.indexOf('drop') !== -1 || data.indexOf('delete') !== -1) {
      sock.writeProto(0, ['db', 'query'], ['put'], ['that was not a very nice query']);
    } else {
      let result = await query({ text: queryString, values, options });
      // Result is a rows=[] or a { rows=[], fields={} }...
      sock.writeProto(0, ['db', 'query'], ['put'], result);
    }
  });

  RootEmitter.on(['db', 'tables'].join('/'), function(proto, sock) {
    log('send them tables');
  });

  // [ref] https://node-postgres.com/apis/pool#events
  // Whenever the pool establishes a new client connection to the PostgreSQL backend it will
  // emit the connect event with the newly connected client.
  // This presents an opportunity for you to run setup commands on a client.
  pool.on('connect', function(c) {
    log(id, 'connect');
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
  // [ref] Handling errors: https://stackoverflow.com/a/61686555x
  pool.on('error', function(err, c) {
    // log(id, 'error', err);
  });
  
  // export const query = async ({ text, values=[], type='Number', opts={} }) => {
  let firstQuery = null;
  async function query({ text, values=[], type='number', options = {}, doLog=true}) {
    let { rowMode = 'object' } = options;
    let client, result;
    
    // lol, this is kind of messy.. but if we're never doing a new Database anywhere..
    // hmm.
    if (!firstQuery) {
      log('init');
      firstQuery = true;
    };

    info.queries += 1;
    try {
      if (doLog) {
        let s = text;
        s = s.substring(0, 30); s += '..'; s = `${s.padEnd(32, ' ')}`;
        s = fg([100, 100, 100], s); s += ` -> <${bold(type)}>`;
        log('query()', s);
      }

      client = await pool.connect();
      result = await client.query({ text, values, rowMode });
      let { rows = [], fields } = result;
      // So this actually wasn't doing anything - still need to figure out how exactly we're doing typing
      // let typedRows = rows.map(r => getType({ type, data: r }));
      // console.log('fields', fields);
      // console.log('rows[0]', rows[0]);
      return rowMode === 'array' ? { rows, fields } : rows;

      return typedRows;
    } catch (err) {
      log('query()', 'error', `\n${what(err)}`);
      let rows = [];
      return rowMode === 'array' ? { rows: [[err.message]], fields: [{ dataRowID: 1043, name: 'Error' }] } : rows;

      // [todo] We could do a rollback if necessary: client.query('rollback');
    } finally {
      if (client) client.release();
    }
  }

  async function hasTable(tableName) {
    let rows = await query({ text: "select * from information_schema.tables where table_name = $1;", values: [tableName] });
    return rows.length === 1;
  }

  async function getTables() {
    let rows = await query({ text: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';" });
    return rows.map(r => r.table_name);
  };

  async function getRowCount(tableName) {
    let tableExists = await hasTable(tableName);
    if (tableExists) {
      // return await this.query({ text: "select count(*) from $1;", values: [tableName] });
      return await query({ text: `select count(*) from ${tableName};` });
    } else {
      return -1;
    }
  }

  // https://dba.stackexchange.com/questions/99428/how-can-i-get-my-servers-uptime
  // https://www.postgresql.org/docs/current/functions-info.html
  async function getUptime() {
    let [ pgInterval] = await query({ text: "select current_timestamp - pg_postmaster_start_time() as uptime;" });
    let { days, hours, minutes, seconds, milliseconds } = pgInterval;
    return pgInterval;
  }

  return {
    info,
    getInfo,
    query,
    // pool,

    hasTable,
    getTables,
    getRowCount,
    getUptime,
   
    // queries,
  };
};

// tbd if import { query } is better, or have it as like import Database from ..
// export async function query({ text='', values=[], type='number' }) {
//   return await globalDatabase.query({ text, values, type });
// };


// [todo] https://node-postgres.com/apis/cursor
// A cursor can be used to efficiently read through large result sets without loading the entire result-set into
// memory ahead of time. It's useful to simulate a 'streaming' style read of data, or exit early from a large result set.
// The cursor is passed to client.query and is dispatched internally in a way very similar to how normal queries are sent,
// but the API it presents for consuming the result set is different.
const cursorQuery = async ({ text, values=[], type='Number', opts={} }) => { }

// const db = new Database();
// export default db;

