/* eslint-disable no-whitespace-before-property */
import React from 'react';
import { connectToServer, ServerData } from './connection/listener';
import { ServerStatus } from './connection/ServerStatus';
import HeartbeatMonitor from './heartbeats';
import Logs from './logs';

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface AppProps { }

interface AppState {
  now: number;
  view: "heartbeats" | "logs";
  hasErrors: boolean;
  /** Startup data for the heartbeats */
  observedData: ServerData[],
}

export default class App extends React.Component<AppProps, AppState> {

  _serverStatuses: Map<string, ServerStatus>;
  _logs: Map<string, Log[]>;

  constructor(props: AppProps) {
    super(props);
    this.state = {
      now: Date.now(),
      view: "heartbeats",
      hasErrors: false,
      observedData: [ ],
    };
    this._serverStatuses = new Map();
    this._logs = new Map();
  }

  async startListeningServer() {

    const serversData = await connectToServer({
      onItemFound: (server: string, item: FoundItem) => this._serverStatuses.get(server)?.pushFoundItem(item),
      onHeartbeat: (server: string, hb: Heartbeat)   => {
        console.log(server, hb);
        this._serverStatuses.get(server)?.addHeartbeat(hb);
      },
      onLog:       (server: string, logs: Log[])     => this._logs          .get(server)?.push(...logs)
    });

    const observedData: ServerData[] = [];

    serversData.forEach(s => {
      this._serverStatuses.set(s.server, new ServerStatus({ searches: s.searches }));
      this._logs.set(s.server, [ ]);
      observedData.push(s);
    });

    if (serversData.length === 0) {
      this.setState({ hasErrors: true });
    } else {
      this.setState({ observedData: observedData });
    }

  }

  /** The simplest idea I came with to deal with the data is to have a "clock" that
   *  force the refresh every 500ms, rather than having each new heartbeat (or so)
   *  forcing a refresh. That's why I set the state on the "now" (the clock, like
   *  in a cpu) and not on the data received.
   */
  async startClock() {
    while (true) {
      await sleep(500);
      this.setState({ now: Date.now() });
    }
  }

  async componentDidMount() {
    await this.startListeningServer();
    await this.startClock();
  }

  render() {

    return (
      <div className="App">

        {this.state.hasErrors && <div>There has been an error (probably no server available).</div>}

        <hr />

        { this.state.view === "heartbeats" && <HeartbeatMonitor now={this.state.now} observedData={this.state.observedData} serverStatuses={this._serverStatuses} /> }
        { this.state.view === "logs"       && <Logs /> }

      </div>
    );
  }

}
