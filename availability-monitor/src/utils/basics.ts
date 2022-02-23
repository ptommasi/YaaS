const util = require('util');

export function splitInChunks<T>(array: T[], chunkSize=3) {
  const result: T[][] = [];
  for (let i = 0, j = array.length; i < j; i += chunkSize) {
      result.push( array.slice(i,i + chunkSize) );
  }
  return result;
}

export function flattenArray<T>(arrays: T[][]) {
  const result: T[] = [].concat.apply([], arrays);
  return result;
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// credits to https://stackoverflow.com/questions/37234191/how-do-you-implement-a-racetosuccess-helper-given-a-list-of-promises
export function firstSuccess<T>(promises: Promise<T>[]): Promise<T> {
  return Promise.all(promises.map(p => {
    // If a request fails, count that as a resolution so it will keep
    // waiting for other possible successes. If a request succeeds,
    // treat it as a rejection so Promise.all immediately bails out.
    return p.then(
      val => Promise.reject(val),
      err => Promise.resolve(err)
    );
  })).then(
    // If '.all' resolved, we've just got an array of errors.
    errors => Promise.reject(errors),
    // If '.all' rejected, we've got the result we wanted.
    val => Promise.resolve(val)
  );
}

export function printJSON(data: any) {
  return util.inspect(data, false, null, true /* enable colors */)
}