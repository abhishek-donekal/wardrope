"""Unit tests for the Claude overload fallback.

Regression guard: Anthropic serves `529 overloaded_error` in bursts. Without a
second model to fall back on, a burst reaches the user as "the stylist is taking
a short break" — the exact failure App Review rejected the app for.
"""
import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server  # noqa: E402


class _Block:
    def __init__(self, type: str, text: str = ""):
        self.type = type
        self.text = text


class _Msg:
    def __init__(self, content):
        self.content = content
        self.stop_reason = "end_turn"


def _fake_client(behaviour: dict, calls: list):
    """AsyncAnthropic stand-in: `behaviour` maps a model name to a reply or an exception."""

    class _Messages:
        async def create(self, model, **kwargs):
            calls.append(model)
            outcome = behaviour[model]
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

    class _Client:
        def __init__(self, api_key=None):
            self.messages = _Messages()

    return _Client


@pytest.fixture(autouse=True)
def _api_key(monkeypatch):
    monkeypatch.setattr(server, "ANTHROPIC_API_KEY", "test-key")


def _run(monkeypatch, behaviour):
    calls: list = []
    monkeypatch.setattr(server, "AsyncAnthropic", _fake_client(behaviour, calls))
    text = asyncio.run(
        server._claude_call("test", "primary-model", "fallback-model", max_tokens=10, messages=[])
    )
    return text, calls


def test_primary_answer_is_used_without_touching_the_fallback(monkeypatch):
    text, calls = _run(monkeypatch, {"primary-model": _Msg([_Block("text", "primary answer")])})
    assert text == "primary answer"
    assert calls == ["primary-model"]


def test_overloaded_primary_falls_back_to_the_second_model(monkeypatch):
    text, calls = _run(
        monkeypatch,
        {
            "primary-model": RuntimeError("Error code: 529 - overloaded_error"),
            "fallback-model": _Msg([_Block("text", "fallback answer")]),
        },
    )
    assert text == "fallback answer"
    assert calls == ["primary-model", "fallback-model"]


def test_primary_answering_with_no_text_also_falls_back(monkeypatch):
    text, calls = _run(
        monkeypatch,
        {
            "primary-model": _Msg([_Block("thinking")]),
            "fallback-model": _Msg([_Block("text", "fallback answer")]),
        },
    )
    assert text == "fallback answer"
    assert calls == ["primary-model", "fallback-model"]


def test_both_models_failing_raises_claude_unavailable(monkeypatch):
    calls: list = []
    monkeypatch.setattr(
        server,
        "AsyncAnthropic",
        _fake_client(
            {"primary-model": RuntimeError("529"), "fallback-model": RuntimeError("529")}, calls
        ),
    )
    with pytest.raises(server.ClaudeUnavailable):
        asyncio.run(server._claude_call("test", "primary-model", "fallback-model", max_tokens=10, messages=[]))
    assert calls == ["primary-model", "fallback-model"]


def test_no_fallback_configured_still_raises(monkeypatch):
    calls: list = []
    monkeypatch.setattr(server, "AsyncAnthropic", _fake_client({"primary-model": RuntimeError("529")}, calls))
    with pytest.raises(server.ClaudeUnavailable):
        asyncio.run(server._claude_call("test", "primary-model", None, max_tokens=10, messages=[]))
    assert calls == ["primary-model"]


def test_missing_api_key_raises_before_any_call(monkeypatch):
    monkeypatch.setattr(server, "ANTHROPIC_API_KEY", "")
    with pytest.raises(server.ClaudeUnavailable):
        asyncio.run(server._claude_call("test", "primary-model", "fallback-model", max_tokens=10, messages=[]))
