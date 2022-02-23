import { logger } from "../../utils/logger";

const needle = require('needle');

// The code below sets the bearer token from your environment variables
// To set environment variables on macOS or Linux, run the export command below from the terminal:
// export BEARER_TOKEN='YOUR-TOKEN'
const token = "ADD BEARER TOKEN"

const rulesURL = 'https://api.twitter.com/2/tweets/search/stream/rules';

// this sets up two rules - the value is the search terms to match on, and the tag is an identifier that
// will be applied to the Tweets return to show which rule they matched
// with a standard project with Basic Access, you can add up to 25 concurrent rules to your stream, and
// each rule can be up to 512 characters long

export async function getAllRules() {

  const response = await needle('get', rulesURL, {
    headers: { "Authorization": `Bearer ${token}` }
  })

  if (response.statusCode !== 200) {
    logger.error("Error:", response.statusMessage, response.statusCode)
    throw new Error(response.body);
  }

  logger.info("Current rules: ", response.body);

  return (response.body as InstantatedRulesResponse);

}

export async function deleteAllRules(rules: InstantatedRulesResponse) {

    if (!Array.isArray(rules.data)) {
        return null;
    }

    const ids = rules.data.map(rule => rule.id);

    const data = {
        "delete": {
            "ids": ids
        }
    }

    const response = await needle('post', rulesURL, data, {
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${token}`
        }
    })

    if (response.statusCode !== 200) {
        throw new Error(response.body);
    }

    logger.info("Rules deleted: ", response.body);

    return (response.body);

}

export async function setRules(rules: Rule[]) {

    const data = {
        "add": rules
    }

    const response = await needle('post', rulesURL, data, {
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${token}`
        }
    })

    if (response.statusCode !== 201) {
        throw new Error(response.body);
    }

    logger.info("New rules set: ", response.body);

    return (response.body);

}

export async function resetRules(rules: Rule[]) {

  // Gets the complete list of rules currently applied to the stream
  const currentRules = await getAllRules();

  // Delete all rules. Comment the line below if you want to keep your existing rules.
  await deleteAllRules(currentRules);

  // Add rules to the stream. Comment the line below if you don't want to add new rules.
  await setRules(rules);

}