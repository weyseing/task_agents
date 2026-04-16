"""Web search tool using DuckDuckGo HTML search."""

import asyncio
import json
import re
from html import unescape
from html.parser import HTMLParser
from urllib.parse import unquote, urlparse, parse_qs

import httpx

SCHEMA = {
    "name": "web_search",
    "description": (
        "Search the web for information or images. "
        "Use this when the user asks about topics you don't know, needs current/real-time information, "
        "or asks for images of something. "
        "When the user asks about a person, place, or thing, call this tool TWICE: "
        "once with search_type 'text' for info, and once with search_type 'images' for photos."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query",
            },
            "search_type": {
                "type": "string",
                "enum": ["text", "images"],
                "description": "Type of search: 'text' for info (default), 'images' for image search",
            },
            "max_results": {
                "type": "integer",
                "description": "Max results to return (default: 5)",
            },
        },
        "required": ["query"],
    },
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html",
    "Accept-Language": "en-US,en;q=0.9",
}


class _DDGResultParser(HTMLParser):
    """Parse DuckDuckGo HTML search results."""

    def __init__(self):
        super().__init__()
        self.results: list[dict] = []
        self._current: dict = {}
        self._capture: str | None = None

    def handle_starttag(self, tag, attrs):
        attrs_d = dict(attrs)
        cls = attrs_d.get("class", "")
        if tag == "a" and "result__a" in cls:
            raw_url = attrs_d.get("href", "")
            self._current = {"title": "", "url": _extract_url(raw_url), "snippet": ""}
            self._capture = "title"
        if tag == "a" and "result__snippet" in cls:
            self._capture = "snippet"

    def handle_endtag(self, tag):
        if tag == "a" and self._capture == "title":
            self._capture = None
        if tag == "a" and self._capture == "snippet":
            self._capture = None
            if self._current.get("title"):
                self.results.append(self._current)
            self._current = {}

    def handle_data(self, data):
        if self._capture and self._current:
            self._current[self._capture] += data


def _extract_url(ddg_url: str) -> str:
    """Extract the real URL from DuckDuckGo's redirect wrapper."""
    parsed = urlparse(ddg_url)
    uddg = parse_qs(parsed.query).get("uddg")
    if uddg:
        return unquote(uddg[0])
    return ddg_url


def _search_text(query: str, max_results: int) -> list[dict]:
    resp = httpx.get(
        "https://html.duckduckgo.com/html/",
        params={"q": query},
        headers=HEADERS,
        timeout=15,
        follow_redirects=True,
    )
    parser = _DDGResultParser()
    parser.feed(resp.text)
    # Filter out DuckDuckGo ad results
    results = [r for r in parser.results if "duckduckgo.com/y.js" not in r["url"]]
    return results[:max_results]


def _search_images(query: str, max_results: int) -> list[dict]:
    """Fetch images via Bing Image search HTML scraping."""
    try:
        resp = httpx.get(
            "https://www.bing.com/images/search",
            params={"q": query, "first": "1"},
            headers=HEADERS,
            timeout=15,
            follow_redirects=True,
        )
        # Bing embeds image metadata as JSON in the 'm' attribute of iusc elements
        matches = re.findall(r'class="iusc".*?m="([^"]+)"', resp.text)
        results = []
        for m_raw in matches[:max_results]:
            data = json.loads(unescape(m_raw))
            results.append(
                {
                    "title": data.get("t", ""),
                    "image": data.get("murl", ""),
                    "thumbnail": data.get("turl", ""),
                    "url": data.get("purl", ""),
                    "source": urlparse(data.get("purl", "")).netloc,
                }
            )
        return results
    except Exception:
        return []


def _search_sync(
    query: str, search_type: str = "text", max_results: int = 5
) -> dict:
    # Always fetch text results
    text_results = _search_text(query, max_results)
    result: dict = {"type": "text_results", "query": query, "results": text_results}

    # Also fetch images when requested (or always for non-trivial queries)
    if search_type == "images" or len(query.split()) >= 2:
        image_results = _search_images(query, max_results)
        if image_results:
            result["images"] = image_results

    return result


async def handler(
    query: str, search_type: str = "text", max_results: int = 5
) -> dict:
    try:
        return await asyncio.to_thread(_search_sync, query, search_type, max_results)
    except Exception as e:
        return {"error": str(e)}
