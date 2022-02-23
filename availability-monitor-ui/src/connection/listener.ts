import axios from 'axios';
import io from "socket.io-client";

const serverList = [ "192.168.42.128:8080", "localhost:8080", "localhost:8081" ];

function openTab(url: string) {
  // window.open(url, "_blank");
}

const twitterAudio = new Audio('/sounds/twitter.mp3');
const amazonAudio = new Audio('/sounds/amazon_prime_video.mp3');

export interface ServerData { 
  server: string;
  links: ObservedLink[];
  searches: ObservedSearches;
}

interface Options {
  onItemFound: (server: string, item: FoundItem) => void;
  onHeartbeat: (server: string, hb:   Heartbeat) => void;
  onLog:       (server: string, logs: Log[]    ) => void;
}

async function setupServer(server: string, opt: Options) {

    try {

      console.info(`Trying to connect to server ${server} ...`);

      const [ linksResponse, searchesResponse, pastLogs ] = await Promise.all([
        axios.get<ObservedLink[]  >(`http://${server}/monitored_links`   , { timeout: 2000 }),
        axios.get<ObservedSearches>(`http://${server}/monitored_searches`),
        axios.get<LogsResponse    >(`http://${server}/logs`              )
      ])

      opt.onLog(server, pastLogs.data.logs);

      const data: ServerData = { server, links: linksResponse.data, searches: searchesResponse.data };

      const socket = io(`http://${server}/`, { reconnectionDelay: 20000, timeout: 20000, reconnectionAttempts: 10 });

      socket.on("onItemFound", (item: FoundItem) => {

        console.log("onItemFound", item);

        item.origin === "twitter"       && twitterAudio.play();
        item.origin === "amazon-link"   && amazonAudio.play();
        item.origin === "amazon-search" && amazonAudio.play();

        openTab(item.url);

        opt.onItemFound(server, item);

      });

      socket.on("onHeartbeat", (hb: Heartbeat) => opt.onHeartbeat(server, hb));

      socket.on("onLog", (log: Log) => opt.onLog(server, [ log ]));

      return data;
    
    } catch (err) {
        console.error(`Impossible to fetch the data from ${server}.`);
    }

    return null;

}

export async function connectToServer(opt: Options) {

  const servers: ServerData[] = [];

  for (let server of serverList) {
    const data = await setupServer(server, opt);
    data !== null && servers.push(data);
  }

  return servers;

}