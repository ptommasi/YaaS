import React from 'react';
import { coloredDelay } from './delay-color';
import { ServerStatus } from '../connection/ServerStatus';

interface Props {
  now: number;
  server: string;
  searches: ObservedSearches;
  serverStatus: ServerStatus;
}

interface State {
}

export default class SearchesTable extends React.Component<Props, State> {

  getSummary(domain: string, term: string) {
    let summary = <span>...</span>;
    const checkTime = this.props.serverStatus.getPollHeartbeat(domain, term)?.time;
    if (checkTime) {
      const delay = Math.ceil((this.props.now - checkTime) / 1000);
      const avg = this.props.serverStatus.getPollHeartbeatAvg(domain, term);
      const avgN = this.props.serverStatus.getPollHeartbeatAvgN(domain, term);
      summary = <>{coloredDelay(delay, `${delay}s ago`)} <small>({coloredDelay(avg, `~${avg.toFixed(2)}s`)}, {coloredDelay(avg, `~${avgN.toFixed(2)}s`)})</small></>;
    }
    return summary;
  }

  render() {

    const domains = this.props.searches.domains;
    const terms = this.props.searches.terms;
    const Ds = domains.length;
    const Ts = terms.length;

    return (
      <table className="SearchesTable">
        <thead>
          <tr>
            <th><i><small>@{this.props.server}</small></i></th>
            {terms.map((t, i) => <th key={i}>{t}</th> )}
          </tr>
        </thead>
        <tbody>
        {domains.map((d, i) => (
          <tr key={Ts+i*Ds}>
            <th className="domainCell">{d.startsWith("https://www.") ? d.substr(12) : d}</th>
            {terms.map((t, j) => <td key={Ts+i*Ds+j} className="timeCell">{this.getSummary(d, t)}</td> )}
          </tr>
        ))}
        </tbody>
      </table>
    );
  }

}
