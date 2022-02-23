export function addZ(n: number) { return n < 10? '0' + n :'' + n; }

export function addZZ(n: number) {
  if (n < 10) {
    return '00' + n;
  } else if (n < 100) {
    return '0' + n;
  } else {
    return n;
  }
}

export function inMinutes(milliseconds: number) {
  const inSeconds = Math.round(milliseconds / 1000);
  const seconds = addZ(inSeconds % 60);
  const minutes = Math.floor(inSeconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const minuteZ = addZ(minutes % 60);
    return `${hours}:${minuteZ}:${seconds}`;
  } else {
    return `${minutes}:${seconds}`;
  }
}

export function inSeconds(milliseconds: number) {
  const inSeconds = (milliseconds / 1000).toFixed(3);
  return inSeconds;
}

export function onlyMinutes(milliseconds: number) {
  const inSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(inSeconds / 60);
  return minutes;
}