A very simple, very naive, often unreliable and very unsecure docker image which just takes in input a base64 encoded
image and returns the text within, also [available on dockerhub](https://hub.docker.com/r/pierpytom/very-naive-captcha-solver).

Only use case is to solve very simple captchas, and it's not even very good at it, but it is cheaper to query this service 
first and then fallback on 2captcha in case of error (and there are existing libraries for that, e.g. check
[Furry/2captcha github page](https://github.com/Furry/2captcha)).

Default port is 4184, but it can be changed using the value of the $PORT environment variable.

Only POST requests under the `/solve` path are served, and payload must be in the format `{ data: <base64image> }`. 

An example usage from another service on the same machine would be:
```javascript
  // Fetch the image base64 data (it could be an external service)
  const contents = fs.readFileSync('data/Captcha_alvgyhvdaj.jpg', { encoding: 'base64' });
  // Put the base64 image in the 'data' field 
  const response = await axios.post("http://localhost:4184/solve", { data: contents }))
  console.log(response.data);
```

And output would be something like:
```json
{ "solution": "JBKAMB" }
```

If you have an URL rather than a file (most probable), this async function could be used instead:
```javascript
async function getBase64(url: string) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data, 'binary').toString('base64');
}
```

Software is provided as is under MIT license.