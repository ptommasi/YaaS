
export function coloredDelay(delay: number, label: any) {

  let className = "";

  if (delay > 20) {
    className = "red";
  } else if (delay > 12) {
    className = "orange";
  } else if (delay > 8) {
    className = "yellow";
  } else {
    className = "green";
  }

  return (
    <span className={className}>{label}</span>
  )
}