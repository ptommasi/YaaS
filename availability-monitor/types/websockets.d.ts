// type LinkOrigin = "amazon-link" | "currys";
// type SearchOrigin = "amazon-search" | "part-alert";
// type PollOrigin = SearchOrigin | LinkOrigin;
// type StreamOrigin = "twitter";
// type Origin = StreamOrigin | PollOrigin | "console";

interface LinkHeartbeat {
  time: number;
  type: "link";
  origin: string;
  link: {
    url: string;
    title: string;
  }
}

interface SearchHeartbeat {
  time: number;
  type: "search";
  origin: string;
  search: {
    term: string;
    domain: string;
  }
}

type PollHeartbeat = LinkHeartbeat | SearchHeartbeat ;

interface StreamHeartbeat {
  time: number;
  type: "stream";
  origin: string;
}

type Heartbeat = PollHeartbeat | StreamHeartbeat ;

type HeartbeatCallback = (heartbeat: Heartbeat) => void;

interface FoundItem {
  time: number;
  url: string;
  title: string;
  price: string;
  parsedPrice: number;
  origin: string;
  valid: boolean;
  priceLimit?: number;
}

type ItemFoundCallback = (item: FoundItem) => void;

interface ObservedLink {
  url: string;
  title: string;
  category: string;
  origin: string;
  buyPrice: number;
}

interface ObservedSearches {
  terms:   string[];
  domains: string[];
}