import React from 'react';
import { coloredDelay } from './delay-color';
import { ServerStatus, N } from '../connection/ServerStatus';

interface Props {
  now: number;
  server: string;
  links: ObservedLink[];
  serverStatus: ServerStatus;
}

export default class LinksTable extends React.Component<Props> {

  render() {

    const linesDiv = this.props.links.map((link, i) => {

      let heartbeat = this.props.serverStatus.getLinkHeartbeat(link.url);
      let avgHeartbeat = this.props.serverStatus.getLinkHeartbeatAvg(link.url);
      let avgNHeartbeat = this.props.serverStatus.getLinkHeartbeatAvgN(link.url);
      let summary = <>...</>;
      if (heartbeat) {
        const delay = Math.ceil((this.props.now - heartbeat.time) / 1000);
        summary = coloredDelay(delay, `${delay}s ago`);
      }

      return (
        <tr key={i}>
          <td>&nbsp;&nbsp;&nbsp;</td>
          <td><a href={link.url}>{link.title}</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
          <td className="timeCell">{summary}</td>
          <td className="timeCell"><small>{coloredDelay(avgHeartbeat, `~${avgHeartbeat.toFixed(2)}s`)}</small></td>
          <td className="timeCell"><small>{coloredDelay(avgNHeartbeat, `~${avgNHeartbeat.toFixed(2)}s`)}</small></td>
        </tr>
      );
    });

    return (
      <table className="LinksTable">
        <thead>
          <tr>
            <th></th>
            <th>Products from <i>{this.props.server}</i></th>
            <th>Last Update</th>
            <th>Avg Rate</th>
            <th>Avg Last {N}</th>
          </tr>
        </thead>
        <tbody>
          {linesDiv}
        </tbody>
      </table>
    );
  }

}
