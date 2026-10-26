from __future__ import annotations

import json
import unittest
import urllib.error
from unittest.mock import patch

from backend.ai_provider import _route_candidates, request_ai_text


class _Response:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class AiProviderRetryTests(unittest.TestCase):
    def test_sub2api_deepseek_prefers_chat_completions(self) -> None:
        routes = _route_candidates("https://ai-coding-studio.com/v1", "deepseek-v4-pro", None, None)

        self.assertEqual(routes[0][1], "chat/completions")

    def test_sub2api_gpt_prefers_responses(self) -> None:
        routes = _route_candidates("https://ai-coding-studio.com/v1", "gpt-5.4", None, None)

        self.assertEqual(routes[0][1], "responses")

    def test_timeout_on_first_compatibility_route_uses_next_route(self) -> None:
        success = _Response({"output_text": "备用协议成功"})

        with patch("backend.ai_provider.urllib.request.urlopen", side_effect=[TimeoutError(), success]) as mocked:
            response = request_ai_text(
                "https://ai-coding-studio.com/v1",
                "key",
                "deepseek-v4-pro",
                "hello",
                timeout=2,
                fallback_timeout=1,
                total_timeout=5,
            )

        self.assertEqual(response.text, "备用协议成功")
        self.assertEqual(response.api_kind, "responses")
        self.assertEqual(mocked.call_count, 2)

    def test_network_failure_retries_verified_request_cycle(self) -> None:
        network_error = urllib.error.URLError("SSL EOF")
        success = _Response({"choices": [{"message": {"content": "恢复成功"}}]})

        with patch("backend.ai_provider.urllib.request.urlopen", side_effect=[network_error, success]) as mocked:
            response = request_ai_text(
                "https://example.com/v1",
                "key",
                "model",
                "hello",
                max_retries=1,
                retry_backoff_seconds=0,
                total_timeout=10,
            )

        self.assertEqual(response.text, "恢复成功")
        self.assertEqual(mocked.call_count, 2)
        first_url = mocked.call_args_list[0].args[0].full_url
        retried_url = mocked.call_args_list[1].args[0].full_url
        self.assertEqual(first_url, retried_url)

    def test_requests_disable_compression_and_connection_reuse(self) -> None:
        success = _Response({"choices": [{"message": {"content": "OK"}}]})

        with patch("backend.ai_provider.urllib.request.urlopen", return_value=success) as mocked:
            request_ai_text("https://example.com/v1", "key", "model", "hello")

        headers = {key.casefold(): value for key, value in mocked.call_args.args[0].header_items()}
        self.assertEqual(headers["connection"], "close")
        self.assertEqual(headers["accept-encoding"], "identity")


if __name__ == "__main__":
    unittest.main()
