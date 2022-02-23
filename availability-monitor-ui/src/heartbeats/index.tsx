import React from 'react';
import LinksTable from './LinksTable';
import SearchesTable from './SearchesTable';
import AttemptsTable from './AttemptsTable';
import { ServerData } from '../connection/listener';
import { ServerStatus } from '../connection/ServerStatus';

interface HeartbeatsProps {
  now: number;
  observedData: ServerData[],
  serverStatuses: Map<string, ServerStatus>;
}

export default class Heartbeats extends React.Component<HeartbeatsProps> {

  render() {

    const serverStatus = (s: ServerData) => this.props.serverStatuses.get(s.server) as ServerStatus;

    return (
      <div className="heartbeats">

        {this.props.observedData.map((s, i) => (
          <LinksTable key={i} server={s.server} links={s.links} now={this.props.now} serverStatus ={serverStatus(s)} />
        ))}
        {this.props.observedData.length === 0 && <div>No product links available.</div>}

        <hr />

        {this.props.observedData.map((s, i) => (
          <SearchesTable key={i} server={s.server} searches={s.searches} now={this.props.now} serverStatus={serverStatus(s)} /> 
        ))}
        {this.props.observedData.length === 0 && <div>No searches available.</div>}

        <hr />

        {this.props.observedData.map((s, i) => (
          <AttemptsTable key={i} now={this.props.now} foundItems={serverStatus(s).getFoundItems()} />
        ))}

      </div>
    );
  }

}
