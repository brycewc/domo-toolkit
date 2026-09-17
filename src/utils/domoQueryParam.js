/**
 * Remove a query parameter without re-encoding the ones left behind
 *
 * `URLSearchParams.delete` re-serializes the whole query to its own form, which
 * would undo the encoding `setDomoJsonParam` applied to any other param.
 * @param {URL} urlObj - URL to remove the parameter from, mutated in place
 * @param {string} name - Parameter name
 */
export function deleteQueryParam(urlObj, name) {
  const remaining = splitQuery(urlObj, name);
  urlObj.search = remaining.length > 0 ? `?${remaining.join('&')}` : '';
}

/**
 * Set a JSON query parameter the way Domo itself encodes one
 *
 * Domo rewrites the address bar to `encodeURI` form on arrival, so a param built
 * with `URLSearchParams` (`+` for spaces, `%3A`, `%2C`) makes the URL visibly
 * change once the page loads. Matching Domo's form avoids that rewrite.
 * @param {URL} urlObj - URL to set the parameter on, mutated in place
 * @param {string} name - Parameter name
 * @param {any} value - Value to serialize as JSON
 */
export function setDomoJsonParam(urlObj, name, value) {
  // encodeURI leaves these three intact, where they would end the param, split it,
  // or decode back to a space.
  const encoded = encodeURI(JSON.stringify(value)).replace(/#/g, '%23').replace(/&/g, '%26').replace(/\+/g, '%2B');

  urlObj.search = `?${[...splitQuery(urlObj, name), `${name}=${encoded}`].join('&')}`;
}

function splitQuery(urlObj, excludedName) {
  return urlObj.search
    .replace(/^\?/, '')
    .split('&')
    .filter((part) => part && part.split('=')[0] !== excludedName);
}
