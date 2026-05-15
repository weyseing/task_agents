"""Web search tool using the Tavily API.

Replaces the previous DuckDuckGo HTML + Bing Images scraping which had
become unreliable (Bing API retired Aug 2025, DDG aggressive rate-limiting,
image relevance was effectively random).

Tavily returns text results AND relevant images in a single call, which is
cheaper (one credit instead of two scrapes) and faster than the old design.
"""

import asyncio
import os
from urllib.parse import urlparse

import httpx

SCHEMA = {
    "name": "web_search",
    "description": (
        "Search the web for information and/or images. Returns both web text "
        "results and related images in a SINGLE call — do not call this tool twice. "
        "Use this when the user asks about topics you don't know, needs current "
        "information, or asks for images of something."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "search_type": {
                "type": "string",
                "enum": ["text", "images"],
                "description": (
                    "'text' (default) when info is primary; 'images' when the user "
                    "specifically asked for images. Both kinds are returned either way."
                ),
            },
            "max_results": {
                "type": "integer",
                "description": "Max results to return (default: 5, max: 10)",
            },
        },
        "required": ["query"],
    },
}

TAVILY_ENDPOINT = "https://api.tavily.com/search"


def _hostname(url: str) -> str:
    try:
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return ""


def _search_sync(query: str, search_type: str, max_results: int) -> dict:
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        return {"error": "TAVILY_API_KEY is not configured."}

    n = max(1, min(int(max_results or 5), 10))
    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",  # 1 credit per call
        "max_results": n,
        "include_images": True,
        "include_image_descriptions": True,
        # Tavily synthesizes a paragraph-level answer across the results —
        # gives the agent a ready summary to ground its reply against.
        "include_answer": True,
    }

    try:
        resp = httpx.post(TAVILY_ENDPOINT, json=payload, timeout=20)
    except httpx.RequestError as e:
        return {"error": f"Network error contacting Tavily: {e}"}

    if resp.status_code == 429:
        return {
            "error": "Web search quota exceeded for this month. Resets on the 1st.",
            "quota_exceeded": True,
        }
    if resp.status_code == 401:
        return {"error": "Invalid TAVILY_API_KEY."}
    if resp.status_code != 200:
        return {"error": f"Tavily API error {resp.status_code}: {resp.text[:200]}"}

    data = resp.json()

    results = []
    for r in data.get("results", [])[:n]:
        item = {
            "title": r.get("title", "") or "",
            "url": r.get("url", "") or "",
            # Bumped from 500 → 1800 chars. Tavily's content is usually a
            # multi-sentence excerpt; more text means the agent can ground
            # quotes and follow-up reasoning without a second tool call.
            "snippet": (r.get("content", "") or "")[:1800],
        }
        if (score := r.get("score")) is not None:
            item["score"] = round(float(score), 3)
        if pub := r.get("published_date"):
            item["published_date"] = pub
        results.append(item)

    images = []
    for img in data.get("images", [])[:n]:
        # Tavily returns objects when include_image_descriptions=True,
        # plain URL strings otherwise. Handle both.
        if isinstance(img, dict):
            url = img.get("url", "") or ""
            desc = img.get("description", "") or ""
        else:
            url = str(img)
            desc = ""
        if not url:
            continue
        images.append(
            {
                "title": desc or query,
                "image": url,
                "thumbnail": url,
                "url": url,
                "source": _hostname(url),
            }
        )

    out: dict = {"type": "text_results", "query": query, "results": results}
    if answer := data.get("answer"):
        # Tavily's synthesized summary across all results. The agent sees
        # this directly in the tool result and can ground its reply on it.
        out["answer"] = answer
    if images:
        out["images"] = images
    return out


async def handler(
    query: str, search_type: str = "text", max_results: int = 5
) -> dict:
    try:
        return await asyncio.to_thread(_search_sync, query, search_type, max_results)
    except Exception as e:
        return {"error": str(e)}
