"""
Natural Language Parser — Extracts intent from text prompts for segmentation.

Two-tier approach:
1. Fast keyword-based parsing (default, zero latency)
2. Optional LLM-based parsing for complex queries (when OPENAI_API_KEY is set)
"""

from __future__ import annotations

import os
import re
import json
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


# Keyword → class mapping
CLASS_KEYWORDS: dict[str, list[str]] = {
    "building": ["building", "buildings", "house", "houses", "rooftop", "rooftops", "structure", "structures"],
    "solar_panel": ["solar", "photovoltaic", "pv", "panel", "panels"],
    "road": ["road", "roads", "street", "streets", "highway", "path", "paths", "lane"],
    "vegetation": ["vegetation", "tree", "trees", "green", "forest", "park", "garden", "plant", "plants"],
    "water": ["water", "river", "lake", "pond", "stream", "ocean", "sea", "canal", "pool"],
}

# Spatial modifier patterns
SPATIAL_PATTERNS = {
    "near": re.compile(r"near\s+(?:the\s+)?(\w+)", re.IGNORECASE),
    "around": re.compile(r"around\s+(?:the\s+)?(\w+)", re.IGNORECASE),
    "along": re.compile(r"along\s+(?:the\s+)?(\w+)", re.IGNORECASE),
}

# Quantity hints
QUANTITY_PATTERNS = {
    "all": re.compile(r"\ball\b", re.IGNORECASE),
    "large": re.compile(r"\b(?:large|big|major)\b", re.IGNORECASE),
    "small": re.compile(r"\b(?:small|tiny|minor)\b", re.IGNORECASE),
}


@dataclass
class ParsedPrompt:
    classes: list[str] = field(default_factory=list)
    spatial: dict[str, str] = field(default_factory=dict)
    quantity: str | None = None
    confidence_threshold: float = 0.5
    raw_prompt: str = ""

    def to_dict(self) -> dict:
        return {
            "classes": self.classes,
            "spatial": self.spatial,
            "quantity": self.quantity,
            "confidence_threshold": self.confidence_threshold,
            "raw_prompt": self.raw_prompt,
        }


class NLParser:
    """Simple keyword-based natural language parser for segmentation prompts."""

    def parse(self, prompt: str) -> ParsedPrompt:
        result = ParsedPrompt(raw_prompt=prompt)
        prompt_lower = prompt.lower()
        words = set(re.findall(r'\w+', prompt_lower))

        # Extract target classes
        for cls, keywords in CLASS_KEYWORDS.items():
            if any(kw in words for kw in keywords):
                result.classes.append(cls)

        # If no classes detected, try substring matching
        if not result.classes:
            for cls, keywords in CLASS_KEYWORDS.items():
                if any(kw in prompt_lower for kw in keywords):
                    result.classes.append(cls)

        # Default to all classes if nothing matched
        if not result.classes:
            result.classes = list(CLASS_KEYWORDS.keys())
            result.confidence_threshold = 0.3  # Lower threshold for broad search

        # Extract spatial modifiers
        for modifier, pattern in SPATIAL_PATTERNS.items():
            match = pattern.search(prompt)
            if match:
                result.spatial[modifier] = match.group(1)

        # Extract quantity hints
        for qty, pattern in QUANTITY_PATTERNS.items():
            if pattern.search(prompt):
                result.quantity = qty
                break

        # Adjust confidence based on specificity
        if len(result.classes) == 1:
            result.confidence_threshold = 0.6  # More confident for specific queries

        return result


class LLMParser:
    """LLM-enhanced parser for complex natural language queries."""

    SYSTEM_PROMPT = """You are a geospatial query parser. Given a natural language prompt about satellite/aerial imagery analysis, extract:
- classes: list of target classes from [building, solar_panel, road, vegetation, water]
- spatial: dict of spatial modifiers (e.g. {"near": "river", "along": "highway"})
- quantity: "all" | "large" | "small" | null
- confidence_threshold: float 0.0-1.0 (higher = stricter)
- temporal: any time references (e.g. "since 2023", "new")

Respond ONLY with valid JSON. Example:
{"classes": ["building"], "spatial": {"near": "water"}, "quantity": "large", "confidence_threshold": 0.7, "temporal": "new since 2023"}"""

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                import httpx
                self._client = httpx.Client(timeout=10.0)
            except ImportError:
                return None
        return self._client

    def parse(self, prompt: str) -> ParsedPrompt | None:
        """Try LLM parsing. Returns None if unavailable or fails."""
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return None

        client = self._get_client()
        if not client:
            return None

        try:
            response = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": self.SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0,
                    "max_tokens": 200,
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            data = json.loads(content)

            result = ParsedPrompt(raw_prompt=prompt)
            valid_classes = set(CLASS_KEYWORDS.keys())
            result.classes = [c for c in data.get("classes", []) if c in valid_classes]
            result.spatial = data.get("spatial", {})
            result.quantity = data.get("quantity")
            result.confidence_threshold = float(data.get("confidence_threshold", 0.5))

            if not result.classes:
                return None  # Fall back to keyword parser

            logger.info(f"LLM parsed '{prompt}' → classes={result.classes}")
            return result
        except Exception as e:
            logger.warning(f"LLM parsing failed: {e}")
            return None


class HybridNLParser:
    """Two-tier parser: LLM first (if available), keyword fallback."""

    def __init__(self):
        self._keyword_parser = NLParser()
        self._llm_parser = LLMParser()

    def parse(self, prompt: str) -> ParsedPrompt:
        # Try LLM for complex queries (>5 words)
        if len(prompt.split()) > 5:
            llm_result = self._llm_parser.parse(prompt)
            if llm_result:
                return llm_result

        return self._keyword_parser.parse(prompt)


# Singletons
nl_parser = HybridNLParser()
keyword_parser = NLParser()
