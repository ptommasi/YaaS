import { logger } from "./logger";

function isSubstring(html: string, pos: number, substring: string) {
  for(let i = 0; i < substring.length; i++) {
    if (html[pos + i] !== substring[i]) {
      return false;
    }
  }
  return true;
}

export function extractHtmlSnippet(html: string, elementStartIdentifier: string, elementType: string, startSearchAt=0): string {

  const elementStart = html.indexOf(elementStartIdentifier, startSearchAt);

  if (elementStart < 0) {
    // logger.warn(`Tag ${elementStartIdentifier} not found.`);
    return null;
  }

  let openingSameElement = 1;
  let closingSameElement = 0;

  let elementEnd = elementStart + elementStartIdentifier.length;

  for(; elementEnd < html.length; elementEnd++) {
    if (isSubstring(html, elementEnd, `<${elementType} `)) {
      // Do not count self closing elements
      if(!isSelfClosing(html, elementEnd)) {
        openingSameElement++;
      }
    } else if (isSubstring(html, elementEnd, `</${elementType}>`)) {
      closingSameElement++;
    }

    if (openingSameElement === closingSameElement) {
      elementEnd += `</${elementType}>`.length;
      break;
    }

  }
  
  // Just to simplify debug, remove too many blank spaces
  // const content = html.substring(soldByStart, soldByEnd).trim().replace(/\s+/g, ' ');
  const content = html.substring(elementStart, elementEnd);

  return content;

}

// function extractElement(element: string)
function isSelfClosing(html: string, start: number) {
  if(html[start] !== "<") {
    logger.warn("Need to start with a tag.");
    throw Error("Neet to start with a tag.");
  }
  for(let i=start+1; i<html.length; i++) {
    if (isSubstring(html, i, "/>")) {
      return true;
    }
    if (html[i] === ">") {
      return false;
    }
  }
  logger.warn("Closing tag not found, went overflow!");
  throw Error("Closing tag not found, went overflow!");
}

function tagOpening(html: string, start: number) {
  if(html[start] !== "<") {
    logger.warn("Need to start with a tag.");
    throw Error("Neet to start with a tag.");
  }
  for(let i=start+1; i<html.length; i++) {
    if (html[i] === ">") {
      return html.substring(start, i+1);
    }
  }
  logger.warn("Closing tag not found, went overflow!");
  throw Error("Closing tag not found, went overflow!");
}

export function extractAllElements(html: string, tag: string) {

  const snippets: string[] = [];
  let location = 0;

  while (true) {
    location = html.indexOf(tag, location);
    if (location < 0) {
      return snippets;
    }
    const tagElement = tagOpening(html, location);
    snippets.push(tagElement);
    location += tag.length;
  }

}

export function extractAttribute(tag: string, attribute: string) {
  const searchString = `${attribute}="`;
  const attributeLocation = tag.indexOf(searchString);
  if (attributeLocation <= 0) {
    return null;
  }
  const end = tag.indexOf('"', attributeLocation + searchString.length);
  return tag.substring(attributeLocation + searchString.length, end);
}