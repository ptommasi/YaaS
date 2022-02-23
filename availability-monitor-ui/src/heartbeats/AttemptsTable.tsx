import React from 'react';

interface Props {
  now: number;
  foundItems: FoundItem[];
}

export default class AttemptsTable extends React.Component<Props> {

  render() {

    if (this.props.foundItems.length === 0) {
      return <div>No items have been found yet.</div>
    }

    return (
      <ul className="AttemptsTable">
        {this.props.foundItems.map((a, i) => (
          <li key={i}>
            <a href={a.url} target="_blank" rel="noreferrer">{a.title}</a> (at {a.price}, courtesy of {a.origin} at {new Date(a.time).toLocaleString()})
          </li>
        ))}
      </ul>
    );

  }

}
