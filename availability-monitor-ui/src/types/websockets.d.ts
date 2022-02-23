type LinkOrigin = "amazon-link" | "currys";
type SearchOrigin = "amazon-search" | "part-alert";
type PollOrigin = SearchOrigin | LinkOrigin;
type StreamOrigin = "twitter";
type Origin = StreamOrigin | PollOrigin;

interface LinkHeartbeat {
  time: number;
  type: "link";
  origin: LinkOrigin;
  link: {
    url: string;
    title: string;
  }
}

interface SearchHeartbeat {
  time: number;
  type: "search";
  origin: SearchOrigin;
  search: {
    term: string;
    domain: string;
  }
}

type PollHeartbeat = LinkHeartbeat | SearchHeartbeat ;

interface StreamHeartbeat {
  time: number;
  type: "stream";
  origin: StreamOrigin;
}

type Heartbeat = PollHeartbeat | StreamHeartbeat ;

interface FoundItem {
  time: number;
  url: string;
  title: string;
  price: string;
  parsedPrice: number;
  origin: Origin;
  priceLimit?: number;
}

interface ObservedLink {
  url: string;
  title: string;
  category: string;
  origin: PollOrigin;
  buyPrice: number;
}

interface ObservedSearches {
  terms:   string[];
  domains: string[];
}

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface Log {
  groupId: string;
  time: number;
  level: LogLevel;
  messages: any[];
}

interface LogsResponse {
  logs: Log[];
}
