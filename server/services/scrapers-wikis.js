import Files from './files.js';
import { emitter } from '../server.js';

import http, { Agent } from 'node:http';
import https from 'node:https';

// Utils
import what from '../lib/common/utils/what-server.mjs'; import log from '../lib/common/utils/log.mjs';
import {fg, bg, bold, ul, underline, dim, blink, hidden, reset} from '../lib/common/utils/ansi.mjs';
import {numToBytes} from '../lib/common/utils/text.mjs';

import {
  DEFAULT_HEADERS = {},
  REQUEST_DELAY = 5000,
} from './scrapers.js';
// [todo] learn * and yield for thi-ng
// // Using a generator function
// function* getQueryPairs() {
//   yield ['user', 'abc'];
//   yield ['query', 'first'];
//   yield ['query', 'second'];
// }

// [todo] use these for requests/responses with arduinos:
// auth <string> Basic authentication ('user:password') to compute an Authorization header.
// socketPath <string> Unix domain socket. Cannot be used if one of host or port is specified, as those specify a TCP Socket.


// https://www.mediawiki.org/w/api.php?action=help&modules=query%2Ballimages
function allImages({ domain = 'wow' }) {
  return {
    prefix: 'ai',
    id: 'allimages',
    path: `/data/wikis/${domain}/allimages`,

    params: new URLSearchParams({
      action: 'query', format: 'json',

      ailimit: 10, aisort: 'name', aidir: 'ascending', aicontinue: null,
      
      aiprop: 'canonicaltitle|url|size|bitdepth|sha1|mime|mediatype|metadata|commonmetadata|extmetadata|badfile|',

      // Search only for image titles beginning with this file      
      aiprefix: 'Adamant',
      // bytes
      aiminsize: 0, aimaxsize: 9393821803,      
    }),
  }
}

// Recursive WikiMedia queries
// https://www.mediawiki.org/w/api.php?action=help&modules=query%2Ballcategories
function allCategories({ domain = 'minecraft' }) {
  return {
    prefix: 'ac',
    id: 'allcategories',
    path: `/data/wikis/${domain}/allcategories`,

    params: URLSearchParams({
      action: 'query', format: 'json',
      list: 'allcategories',
      
      aclimit: 400,  //1-500
      acprop: 'size|hidden',
      acdir: 'ascending',
    }),
  }
}

// I think this was the wrong way?
// Get all items that are in a category 
// [ref] https://www.mediawiki.org/w/api.php?action=help&modules=query%2Bcategorymembers  
// function allPagesInCategory({ domain = 'neopets', category = 'Chathead_images' }) {
//   return {
//     prefix: 'cm',
//     filename: `/data/wikis/${domain}/category-${category}`,
// 
//     params: new URLSearchParams({
//       action: 'query',
//       format: 'json',
//       list: 'categorymembers',      
//       // e.g. Category:Chathead_images, Category:Skill_Icons, ....
//       cmtitle: category,
//       cmlimit: 400, // 1-500, default is 10
//       cmprop: 'ids|title|sortkey|type|timestamp',
//       cmsort: 'sortkey',
//       cmdir: 'ascending',
//     }),
//   };
// }

// let WIKI_PREFIX = 'ac'; // all cateogires
// let WIKI_PREFIX = 'cm'; collection members

function WikiScraper() {
  let files = new Files();
  let ScraperAgent;
  return { ScraperAgent, wikiMediaScrape, wikiMediaShow, };

  async function wikiMediaScrape() {
    // [note] It is good practice, to destroy() an Agent instance when it is no longer in use.
    ScraperAgent = new https.Agent({
      rejectUnauthorized: false,
      // keepAlive: false, // keepAliveMsecs: 3924, // default 1000, randomize
      // maxSockets: 5, // default was infinity.. // maxFreeSockets: 5,
      // scheduling: 'lifo',       // fifo creates lots of sockets for high request rates, lifo keeps amt of open sockets to minimum.
    });

    let domain = 'runescape';
    let host = 'http://oldschool.runescape.wiki';
    let {
      prefix, id, // 'ac', 'allcategories'
      params,    // wikimedia stuff
      path,      // our own pathing, e.g. /data/wikis/neopets/images
    } = allImages({ domain });


    let url = '/api.php';
    url += '?'+params;
    url = new URL(url, host);

    let scrapes = await files.loadFile({ url: path });
    // let scrapes = await files.getDirectory({ url: path });
    let filename = `${id}`+'-'+`${scrapes.length}`.padStart(4, '0');
    // filename = `${path}/${filename}.json`;


    // [2023-07-05 @ 6AM] This is useful but restructuring the ways we generate the [url, path, host, ....]
    // Open the last-created scrape, find the last cmcontiue and use that.
    // if (scrapes) {
    //   //  let { query } = JSON.parse(await files.loadFile({ url: scrapes[scrapes.length-1] }));
    //   let { query = {} } = scrapes;
    //   let queryKey = Object.keys(query);
    //   if (queryKey.length !== 1) {
    //     log('scrapers', 'wikiQuery', 'UNKNOWN EVENT, MULTIPLE QUERY KEYS', what(queryKey));
    //     return;
    //   }
    //   queryKey = queryKey[0];
    //   let lastItem = query[queryKey][query[queryKey].length-1];
    //   let { title, sortkey } = lastItem
    //   console.log('Last item: ', what(lastItem));
    // 
    //   // This does work FWIW
    //   // url.searchParams.set('cmstarthexsortkey', sortkey);
    // }
    console.log(path);
    console.log(filename);
    console.log(url.searchParams);

    queryWiki(
      ScraperAgent, url,
      async function finalCallback(completeObject) {
        log('scrapers', 'queryWiki', `finalCallback: ${what(completeObject).length}`);
        await files.saveFile({ url : path+'/'+filename, data: completeObject });
      },
      function finalErrorCallback(partialObject, err, data) {
        log('scrapers', 'queryWiki', `finalErrorCallback: ${what(err)}`);
        files.saveFile({ url: `${path}/${filename}_PARTIAL`, data: partialObject });
        files.saveFile({ url: `${path}/${filename}_DATA`, data: { 'data': JSON.stringify(data) } });
      },      
    );
  }

  function queryWiki(agent, url, finalCallback, finalErrorCallback) {
    let startingURL = url;
    let startingReq = {};
    let startingObject = { 'batchcomplete': null, 'query': {} };

    // Intialize the first request, which then recursively follows WikiMedia's { continue }
    let requestOptions = {
      agent,
      headers: { ...DEFAULT_GET_HEADERS },
      method: 'get',
      encoding: 'utf-8',
      protocol: 'https:',
    };    
    log('scrapers', 'queryWiki', `startingReq with url: ${startingURL.href}`);
    startingReq = http.request(startingURL, requestOptions);
    startingReq.on('error', (err) => {
      log('scrapers', 'queryWiki', `startingReq.error: ${err.message}`);
      finalErrorCallback(startingObject, err);
    });
    startingReq.on('socket', (socket) => {
      // End our request once the socket is connected, read the beginning message
      socket.on('connect', () => { startingReq.end(); });
      socket.on('readable', () => { socket.read(); });      
    });

    startingReq.on('response', (startingRes) => {
      queryWikiRecurse(
        startingObject, 
        startingRes,
        startingURL,
        requestOptions,
        function recurseEndCallback(completeObject) {
          startingReq.end();
          agent.destroy();
          finalCallback(completeObject);
        },
        function recurseErrorCallback(failedObject, err, data) {
          startingReq.end();
          agent.destroy();
          finalErrorCallback(failedObject, err, data);
        }
      );
    });
  }

  // Utils
  async function wikiMediaPrint() {
    let { query } = JSON.parse(await files.loadFile({ url: '/data/wikis/runescape/allcategories.json' }));
    let { allcategories } = query; 
    allcategories.sort((c1, c2) => { return c1.files - c2.files; });
    allcategories = allcategories.filter(c => { return c.files >= 50; });
    allcategories = allcategories.map(c => { return { files: c.files, name: c["*"], } });
  }
}

function queryWikiRecurse(currentObject, currentRes, currentURL, requestOptions, recurseEndCallback, recurseErrorCallback) {
  const { headers, statusCode, statusMessage, response, body } = currentRes;
  function handleInterruptInRecursion() {
    log('scrapers', 'queryWiki', `shutdown, saving ${what(currentObject).length}`);
    recurseEndCallback(currentObject);
  }
  emitter.prependListener('shutdown', handleInterruptInRecursion);

  if (statusCode !== 200) {
    return recurseErrorCallback(currentObject, `queryWikiRecurse/statuscode.error - ${statusCode} ${statusMessage}`, null);
  };

  currentRes.on('error', (err) => {
    currentRes.resume();
    return recurseErrorCallback(currentObject, `queryWikiRecurse/currentRes.error: ${error}`, err);
  });

  // [note] Could alloc a Buffer if we knew the expected/estiamted size
  let rawData = '';
  currentRes.setEncoding('utf8');
  currentRes.on('data', (chunk) => { rawData += chunk; });
  currentRes.on('end', () => {
    try {
      const data = JSON.parse(rawData);
      let newMembers = data.query;
      let queryKey = Object.keys(newMembers);

      if (queryKey.length === 1) {
        queryKey = queryKey[0];
        newMembers = newMembers[queryKey];
      } else {
        log('scrapes', 'wikiQuery', 'Unknown event occured, multiple query types returned');
        return recurseErrorCallback(currentObject, 'Unknown event occured, multiple query types returned', data);
      }
      log('scrapers', 'wikiQuery', '\n'+what(newMembers.reduce((acc, m) => [...acc, m], [])));
      currentObject.query[queryKey] = [
        ...(currentObject.query[queryKey] || []),
        ...newMembers, 
      ];
      
      // REQUEST_DELAY = 5000;
      if ('continue' in data) {
        // Update our search params with WikiMedia's { continue: 'asdfsaifjajisdf' }
        
        let continueString = `${WIKI_PREFIX}continue`;
        currentURL.searchParams.set(continueString, data.continue[continueString]);
        // currentURL.searchParams.set('cmcontinue', data.continue.cmcontinue);

        log('scrapers', 'wikiQuery', `[${currentObject.query}] -> ${currentURL.searchParams.get(continueString)}`);

        setTimeout(() => {
        let newRequest = http.request(currentURL, requestOptions);

        newRequest.on('socket', (socket) => {
          socket.on('readable', () => { socket.read(); });
          socket.on('connect', () => {
            emitter.removeListener('shutdown', handleInterruptInRecursion);
            newRequest.end();
          });
        });

        newRequest.on('response', (newRes) => {
          queryWikiRecurse(currentObject, newRes, currentURL, requestOptions, recurseEndCallback, recurseErrorCallback);
        });

        // ... requests can't fail, can they...? That'd be like faulty code on our side
        newRequest.on('error', (err) => {
          return recurseErrorCallback(currentObject, `queryWikiRecurse/newRequest.err: ${err}`, data);
        });
        }, REQUEST_DELAY);
      } else {
        // currentObject.continue = 'FIN';
        return recurseEndCallback(currentObject);
      }
    } catch (err) {
      log('4');
      console.log('Error77', '\n', err, '\n\n', currentObject, '\n\n\n');
      return recurseErrorCallback(currentObject, `queryWikiRecurse.err: ${err}`, rawData);
    }
  });
}

export default WikiScraper;

/*

// https://oldschool.runescape.wiki/w/Template:Chathead_license
// https://oldschool.runescape.wiki/w/Category:Chathead_images

// https://oldschool.runescape.wiki/api.php?action=help&modules=query
// https://www.mediawiki.org/w/api.php?action=help&modules=query
// https://www.mediawiki.org/wiki/API:Main_page

// https://www.mediawiki.org/w/api.php?action=help&modules=query%2Bpageimages
// https://www.mediawiki.org/w/api.php?action=help&modules=query%2Bimages
// https://www.mediawiki.org/w/api.php?action=help&modules=query%2Bimageinfo

/*
  api.php?action=query&
  ....
    [ examples ]
    Get information about all files used in the Main Page.
    generator=images&
    titles=Main%20Page&
    prop=info

    Get name and 100-pixel thumbnail of an image on the Albert Einstein page.
    prop=pageimages&
    titles=Albert%20Einstein&
    pithumbsize=100

    Get a list of files used in the Main Page.
    prop=images&
    titles=Main%20Page

    Get information about all files used in the Main Page.
    generator=images&
    titles=Main%20Page&
    prop=info

    Get information about the current version of File:Albert Einstein Head.jpg.
    titles=File:Albert%20Einstein%20Head.jpg&
    prop=imageinfo

    Get information about versions of File:Test.jpg from 2008 and later.
    titles=File:Test.jpg&
    prop=imageinfo&
    iilimit=50&
    iiend=2007-12-31T23:59:59Z&
    iiprop=timestamp|user|url

    Get site info and revisions of Main Page.
    prop=revisions&
    meta=siteinfo&
    titles=Main%20Page&
    rvprop=user|comment&
    continue= 

    Get revisions of pages beginning with API/.
    generator=allpages&
    gapprefix=API/&
    prop=revisions&
    continue=

    The following example uses the categorymembers list to request results that
    exceed the limit (cmlimit), and thus need to be continued to return more results.
    Notice that because the categorymembers list is used, the continue's second sub-element is titled cmcontinue.

    action=query&
    list=categorymembers&
    cmtitle=Category%3AWikipedians_interested_in_history&
    formatversion=2&
    cmlimit=50
    ->
    {
         "batchcomplete": true,
         "continue": {
                   "cmcontinue": "page|2a2a4c4e2a402a443e382a403a30011201dc11|21583092",
                   "continue": "-||"
          },
          "query": {
                   "categorymembers": [ ....... ] 
           }
    }
*/




  // https://nodejs.org/api/http.html#class-httpagent
  
  /*
    [TBD] Which websites are okay with keeping the Agent connection alive, and if that's performant.

    An Agent is responsible for managing connection persistence and reuse for HTTP clients.
    It maintains a queue of pending requests for a given host and port, reusing a single
    socket connection for each until the queue is empty, at which time the socket is either
    destroyed or put into a pool where it is kept to be used again for requests to the same host and port.
    
    Whether it is destroyed or pooled depends on the keepAlive option. 

    Pooled connections have TCP Keep-Alive enabled for them, but servers may still close idle connections,
    in which case they will be removed from the pool and a new connection will be made when a new
    HTTP request is made for that host and port. Servers may also refuse to allow multiple requests over the same connection,
    in which case the connection will have to be remade for every request and cannot be pooled.
    The Agent will still make the requests to that server, but each one will occur over a new connection.

    When a connection is closed by the client or the server, it is removed from the pool.
    Any unused sockets in the pool will be unrefed so as not to keep the Node.js process
    running when there are no outstanding requests. (see socket.unref()).

    It is good practice, to destroy() an Agent instance when it is no longer in use, because unused sockets consume OS resources.

    Sockets are removed from an agent when the socket emits either a 'close' event o\r an
    'agentRemove' event. When intending to keep one HTTP request open for a long time without keeping
    it in the agent, something like the following may be done:

    http.get(options, (res) => {
    // Do stuff
    }).on('socket', (socket) => {
    socket.emit('agentRemove');
    }); 

    An agent may also be used for an individual request. By providing {agent: false} as an
    option to the http.get() or http.request() functions, a one-time use Agent with default
    options will be used for the client connection.
   */
