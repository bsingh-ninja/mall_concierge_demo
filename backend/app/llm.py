"""Google Gemini client. Only the intent parser uses it; every route, price and crowd number comes from code.
Key and model come from backend/.env: GEMINI_API_KEY, GEMINI_MODEL.
"""
import json
import os

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types

load_dotenv()

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
TIMEOUT_MS = int(os.getenv("GEMINI_TIMEOUT_MS", "12000"))  # Gemini minimum is 10 s; on stage, a slow answer falls back instead of stalling
NO_KEY_MESSAGE = "No Gemini API key: set GEMINI_API_KEY in backend/.env."


def client() -> genai.Client | None:
    load_dotenv(override=True)
    key = os.getenv("GEMINI_API_KEY", "").strip()
    return genai.Client(api_key=key, http_options=types.HttpOptions(api_version="v1beta", timeout=TIMEOUT_MS)) if key else None


def _error(e: errors.APIError) -> str:
    code = getattr(e, "code", None)
    if code == 429:
        return "Gemini rate limit reached"
    if code in (401, 403):
        return "Gemini rejected the API key"
    return f"Gemini API error {code}"


def _call(prompt: str, system: str, **config) -> tuple[str, int]:
    c = client()
    if c is None:
        raise RuntimeError(NO_KEY_MESSAGE)
    model = os.getenv("GEMINI_MODEL", MODEL)
    try:
        r = c.models.generate_content(
            model=model, contents=prompt,
            config=types.GenerateContentConfig(system_instruction=system, thinking_config=types.ThinkingConfig(thinking_budget=0), **config))
    except errors.APIError as e:
        raise RuntimeError(_error(e)) from e
    tokens = getattr(r.usage_metadata, "total_token_count", 0) or 0
    return (r.text or "").strip(), tokens


def generate_text(prompt: str, system: str) -> tuple[str, int]:
    """Returns (text, tokens used). Raises RuntimeError with a readable message."""
    return _call(prompt, system)


def generate_json(prompt: str, system: str, schema: dict) -> tuple[dict, int]:
    text, tokens = _call(prompt, system, response_mime_type="application/json", response_schema=schema)
    return json.loads(text), tokens
