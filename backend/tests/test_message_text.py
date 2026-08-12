"""Unit tests for Anthropic message text extraction.

Regression guard for the extended-thinking failure: `content[0]` was a ThinkingBlock,
so `content[0].text` raised and every AI feature silently returned an empty answer.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import _message_text  # noqa: E402


class _Block:
    def __init__(self, type: str, **kwargs):
        self.type = type
        for k, v in kwargs.items():
            setattr(self, k, v)


class _Msg:
    def __init__(self, content):
        self.content = content
        self.stop_reason = "end_turn"


def test_thinking_block_first_is_skipped():
    msg = _Msg([
        _Block("thinking", thinking="let me consider the wardrobe"),
        _Block("text", text='{"message": "Here are your looks."}'),
    ])
    assert _message_text(msg) == '{"message": "Here are your looks."}'


def test_redacted_thinking_block_is_skipped():
    msg = _Msg([_Block("redacted_thinking", data="abc"), _Block("text", text="ok")])
    assert _message_text(msg) == "ok"


def test_multiple_text_blocks_are_joined():
    msg = _Msg([_Block("text", text="first"), _Block("text", text="second")])
    assert _message_text(msg) == "first\nsecond"


def test_dict_shaped_blocks():
    msg = _Msg([{"type": "thinking", "thinking": "hmm"}, {"type": "text", "text": "hello"}])
    assert _message_text(msg) == "hello"


def test_no_text_block_returns_empty_string():
    assert _message_text(_Msg([_Block("thinking", thinking="only thinking")])) == ""


def test_empty_and_missing_content():
    assert _message_text(_Msg([])) == ""
    assert _message_text(_Msg(None)) == ""
    assert _message_text(object()) == ""


def test_plain_text_only_message():
    assert _message_text(_Msg([_Block("text", text="  padded  ")])) == "padded"
