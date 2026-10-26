from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from time import monotonic, sleep
from urllib.parse import urlsplit


class ModelDiscoveryError(RuntimeError):
    pass


class AIRequestError(RuntimeError):
    pass


class AIRequestTimeout(AIRequestError):
    """The verified generation route timed out and the caller may reduce its workload."""


class AITransientError(AIRequestError):
    """A temporary transport or upstream failure that can be retried safely."""


class AIRequestCancelled(AIRequestError):
    pass


@dataclass(frozen=True, slots=True)
class AIProvider:
    kind: str
    label: str


@dataclass(frozen=True, slots=True)
class ModelCatalog:
    base_url: str
    models: tuple[str, ...]
    selected_model: str


@dataclass(frozen=True, slots=True)
class AITextResponse:
    text: str
    base_url: str
    model: str
    api_kind: str
    input_chars: int = 0
    output_chars: int = 0
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


@dataclass(frozen=True, slots=True)
class _AttemptFailure:
    category: str
    endpoint: str
    detail: str = ""
    cause: str = ""


_RETRYABLE_HTTP_CODES = {408, 409, 425, 429, 500, 502, 503, 504}


def normalize_api_base(value: str) -> str:
    base_url = value.strip().rstrip("/")
    for suffix in ("/chat/completions", "/responses", "/messages", "/models"):
        if base_url.lower().endswith(suffix):
            base_url = base_url[: -len(suffix)].rstrip("/")
    return base_url


def detect_ai_provider(value: str) -> AIProvider:
    normalized = normalize_api_base(value)
    parsed = urlsplit(normalized)
    host = (parsed.hostname or "").casefold()
    path_parts = {part.casefold() for part in parsed.path.split("/") if part}
    if host == "ai-coding-studio.com" or host.endswith(".ai-coding-studio.com"):
        return AIProvider("sub2api", "Sub2API（GPT优先使用Responses）")
    if host.endswith("minimaxi.com") and "anthropic" in path_parts:
        return AIProvider("minimax-anthropic", "MiniMax（Anthropic兼容）")
    if host == "api.anthropic.com" or "anthropic" in path_parts:
        return AIProvider("anthropic", "Anthropic兼容")
    return AIProvider("openai-compatible", "OpenAI兼容")


def ai_provider_scope(value: str) -> tuple[str, str] | None:
    normalized = normalize_api_base(value)
    host = (urlsplit(normalized).hostname or "").casefold()
    if not host:
        return None
    return detect_ai_provider(normalized).kind, host


def provider_requires_api_key(value: str) -> bool:
    return detect_ai_provider(value).kind in {
        "anthropic",
        "minimax-anthropic",
        "sub2api",
    }


def api_kind_label(api_kind: str) -> str:
    labels = {
        "messages": "Anthropic Messages API",
        "chat/completions": "OpenAI Chat Completions",
        "responses": "OpenAI Responses API",
    }
    return labels.get(api_kind, api_kind)


def _candidate_bases(base_url: str) -> list[str]:
    candidates = [base_url]
    if not base_url.casefold().endswith("/v1"):
        candidates.append(f"{base_url}/v1")
    return candidates


def _headers(
    api_key: str,
    content_type: bool = False,
    provider: AIProvider | None = None,
    api_kind: str = "",
) -> dict[str, str]:
    headers = {
        "Accept": "application/json",
        "Accept-Encoding": "identity",
        "Connection": "close",
        "User-Agent": "Lodestar/1.0",
    }
    if content_type:
        headers["Content-Type"] = "application/json"
    if api_key.strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"
        if provider and (
            provider.kind in {"anthropic", "minimax-anthropic"}
            or api_kind == "messages"
        ):
            headers["x-api-key"] = api_key.strip()
    if provider and (
        provider.kind in {"anthropic", "minimax-anthropic"}
        or api_kind == "messages"
    ):
        headers["anthropic-version"] = "2023-06-01"
    return headers


def _http_error(exc: urllib.error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8", errors="replace")
        payload = json.loads(body)
        detail = payload.get("error", payload)
        if isinstance(detail, dict):
            detail = detail.get("message", detail.get("detail", detail))
        text = str(detail)
    except (OSError, json.JSONDecodeError):
        text = str(exc.reason)
    return text[:500]


def _extract_response_text(payload: dict[str, object], api_kind: str) -> str:
    if api_kind == "messages":
        content = payload.get("content", [])
        if isinstance(content, list):
            return "".join(
                str(item.get("text", "")) for item in content if isinstance(item, dict)
            ).strip()
    if api_kind == "chat/completions":
        choices = payload.get("choices", [])
        if isinstance(choices, list) and choices:
            message = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
            content = message.get("content", "") if isinstance(message, dict) else ""
            if isinstance(content, str):
                return content.strip()
            if isinstance(content, list):
                return "".join(
                    str(item.get("text", "")) for item in content if isinstance(item, dict)
                ).strip()
    output_text = payload.get("output_text", "")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()
    output = payload.get("output", [])
    if isinstance(output, list):
        parts: list[str] = []
        for item in output:
            content = item.get("content", []) if isinstance(item, dict) else []
            if isinstance(content, list):
                parts.extend(
                    str(part.get("text", "")) for part in content if isinstance(part, dict)
                )
        return "".join(parts).strip()
    return ""


def _route_candidates(
    base_url: str,
    model: str,
    preferred_base_url: str | None,
    preferred_api_kind: str | None,
) -> list[tuple[str, str, bool]]:
    routes: list[tuple[str, str, bool]] = []
    provider = detect_ai_provider(base_url)
    preferred_base = normalize_api_base(preferred_base_url or "")
    preferred_kind = (preferred_api_kind or "").strip().casefold()
    if provider.kind in {"anthropic", "minimax-anthropic"}:
        supported_kinds = {"messages"}
    elif provider.kind == "sub2api":
        supported_kinds = {"chat/completions", "responses", "messages"}
    else:
        supported_kinds = {"chat/completions", "responses"}
    if preferred_base and preferred_kind in supported_kinds:
        routes.append((preferred_base, preferred_kind, True))

    if provider.kind in {"anthropic", "minimax-anthropic"}:
        candidates = [base_url if base_url.casefold().endswith("/v1") else f"{base_url}/v1"]
        kinds = ("messages",)
    elif provider.kind == "sub2api":
        candidates = [base_url if base_url.casefold().endswith("/v1") else f"{base_url}/v1"]
        lowered_model = model.strip().casefold()
        if "claude" in lowered_model:
            kinds = ("messages", "chat/completions", "responses")
        elif (
            lowered_model.startswith(("gpt-", "o1", "o3", "o4"))
            or "codex" in lowered_model
        ):
            kinds = ("responses", "chat/completions", "messages")
        else:
            # DeepSeek and most OpenAI-compatible third-party models expose
            # Chat Completions even when the gateway also supports Responses.
            kinds = ("chat/completions", "responses", "messages")
    else:
        candidates = _candidate_bases(base_url)
        kinds = ("chat/completions", "responses")
    for candidate in candidates:
        for api_kind in kinds:
            if not any(base == candidate and kind == api_kind for base, kind, _ in routes):
                routes.append((candidate, api_kind, False))
    return routes


def _failure_summary(failures: list[_AttemptFailure]) -> str:
    categories = {failure.category for failure in failures}
    if "timeout" in categories and categories <= {"timeout", "http"}:
        return "AI服务响应超时。请稍后重试，或检查接口地址、模型和网络是否可用。"
    if "empty" in categories and categories <= {"empty", "timeout"}:
        return "AI服务返回空内容，备用接口也未能及时响应。请稍后重试或联系AI服务提供方。"
    if "non_json" in categories and categories <= {"non_json", "timeout"}:
        return "AI服务返回了无法识别的内容，备用接口也未能及时响应。请确认接口地址和兼容方式。"
    if "empty" in categories:
        return "AI服务返回空内容。请稍后重试或联系AI服务提供方。"
    if "non_json" in categories:
        return "AI服务返回的内容不是有效JSON。请确认接口地址和接口兼容方式。"
    if "network" in categories and categories <= {"network", "timeout"}:
        causes = tuple(dict.fromkeys(item.cause for item in failures if item.cause))
        suffix = f" 原因：{'；'.join(causes[:2])}" if causes else ""
        return f"AI服务连接中断，自动重试后仍未恢复。{suffix}"
    if "no_text" in categories:
        return "AI服务已响应，但没有返回可用文本。请检查所选模型是否支持文本生成。"

    http_failures = [failure for failure in failures if failure.category == "http"]
    if http_failures:
        codes = "、".join(dict.fromkeys(failure.detail for failure in http_failures if failure.detail))
        suffix = f"（HTTP {codes}）" if codes else ""
        causes = tuple(dict.fromkeys(item.cause for item in http_failures if item.cause))
        reason = f" 原因：{'；'.join(causes[:2])}" if causes else ""
        return f"AI服务请求失败{suffix}。{reason}"
    return "AI服务暂时不可用。请检查配置后重试。"


def _has_retryable_failure(failures: list[_AttemptFailure]) -> bool:
    if any(item.category == "network" for item in failures):
        return True
    return any(
        item.category == "http" and item.detail.isdigit()
        and int(item.detail) in _RETRYABLE_HTTP_CODES
        for item in failures
    )


def _extract_stream_text(body: str, api_kind: str) -> str:
    parts: list[str] = []
    found_event = False
    for line in body.splitlines():
        if not line.lstrip().startswith("data:"):
            continue
        found_event = True
        record = line.lstrip()[5:].strip()
        if not record or record == "[DONE]":
            continue
        try:
            payload = json.loads(record)
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict):
            continue
        choices = payload.get("choices", [])
        if isinstance(choices, list) and choices and isinstance(choices[0], dict):
            delta = choices[0].get("delta", {})
            if isinstance(delta, dict) and isinstance(delta.get("content"), str):
                parts.append(str(delta["content"]))
                continue
        if isinstance(payload.get("delta"), str):
            parts.append(str(payload["delta"]))
            continue
        delta = payload.get("delta", {})
        if isinstance(delta, dict) and isinstance(delta.get("text"), str):
            parts.append(str(delta["text"]))
            continue
        text = _extract_response_text(payload, api_kind)
        if text:
            parts.append(text)
    return "".join(parts).strip() if found_event else ""


def _looks_like_html(body: str) -> bool:
    lowered = body.lstrip().casefold()
    return lowered.startswith(("<!doctype html", "<html", "<head", "<body"))


def _read_ai_response(
    response: object,
    api_kind: str,
    endpoint: str,
) -> tuple[str, tuple[int | None, int | None, int | None]]:
    raw = response.read()
    if not raw or not raw.strip():
        raise AIRequestError(f"empty::{endpoint}")
    try:
        body = raw.decode("utf-8-sig").strip()
    except UnicodeDecodeError as exc:
        raise AIRequestError(f"non_json::{endpoint}") from exc
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        streamed = _extract_stream_text(body, api_kind)
        if streamed:
            return streamed, (None, None, None)
        if _looks_like_html(body):
            raise AIRequestError(f"non_json::{endpoint}")
        # Some OpenAI-compatible gateways return model text directly instead of a JSON envelope.
        return body, (None, None, None)
    if isinstance(payload, list):
        return body, (None, None, None)
    if not isinstance(payload, dict):
        raise AIRequestError(f"non_json::{endpoint}")
    text = _extract_response_text(payload, api_kind)
    if text:
        return text, _extract_token_usage(payload)
    if any(key in payload for key in ("content", "choices", "output", "output_text", "error")):
        raise AIRequestError(f"no_text::{endpoint}")
    return body, _extract_token_usage(payload)


def _extract_token_usage(
    payload: dict[str, object],
) -> tuple[int | None, int | None, int | None]:
    usage = payload.get("usage")
    if not isinstance(usage, dict):
        return None, None, None

    def token_value(*keys: str) -> int | None:
        for key in keys:
            value = usage.get(key)
            if isinstance(value, int) and value >= 0:
                return value
        return None

    input_tokens = token_value("input_tokens", "prompt_tokens")
    output_tokens = token_value("output_tokens", "completion_tokens")
    total_tokens = token_value("total_tokens")
    if total_tokens is None and input_tokens is not None and output_tokens is not None:
        total_tokens = input_tokens + output_tokens
    return input_tokens, output_tokens, total_tokens


def select_preferred_model(models: list[str] | tuple[str, ...]) -> str:
    blocked = (
        "embedding",
        "rerank",
        "moderation",
        "whisper",
        "audio",
        "tts",
        "image",
        "realtime",
        "transcribe",
    )
    preferred = (
        "gpt-5",
        "gpt-4.1",
        "gpt-4o",
        "deepseek-chat",
        "qwen",
        "glm",
        "moonshot",
        "doubao",
        "chat",
        "instruct",
    )
    def score(model: str) -> tuple[int, int, str]:
        lowered = model.casefold()
        if any(word in lowered for word in blocked):
            return (1000, len(model), lowered)
        rank = next((index for index, word in enumerate(preferred) if word in lowered), len(preferred))
        return (rank, len(model), lowered)

    ordered = sorted((item.strip() for item in models if item.strip()), key=score)
    safe = [item for item in ordered if not any(word in item.casefold() for word in blocked)]
    return (safe or ordered)[0] if ordered else ""


def discover_models(base_url: str, api_key: str = "", timeout: int = 20) -> ModelCatalog:
    normalized = normalize_api_base(base_url)
    if not normalized:
        raise ModelDiscoveryError("请先填写AI接口地址")
    provider = detect_ai_provider(normalized)
    if provider_requires_api_key(normalized) and not api_key.strip():
        raise ModelDiscoveryError(
            f"{provider.label}识别模型前必须先填写AI密钥。"
            "密钥只保存在当前软件内存中，填写后再点击“识别模型”。"
        )
    if provider.kind in {"anthropic", "minimax-anthropic"}:
        model_routes = (
            [(f"{normalized}/models", normalized)]
            if normalized.casefold().endswith("/v1")
            else [
                (f"{normalized}/v1/models", f"{normalized}/v1"),
                (f"{normalized}/models", normalized),
            ]
        )
    elif provider.kind == "sub2api":
        request_base = normalized if normalized.casefold().endswith("/v1") else f"{normalized}/v1"
        model_routes = [(f"{request_base}/models", request_base)]
    else:
        model_routes = [
            (f"{candidate}/models", candidate) for candidate in _candidate_bases(normalized)
        ]

    errors: list[str] = []
    headers = _headers(api_key, provider=provider)

    for endpoint, request_base in model_routes:
        request = urllib.request.Request(endpoint, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.loads(response.read().decode("utf-8-sig"))
            records = payload.get("data", payload.get("models", []))
            models = []
            for item in records:
                model_id = item.get("id", "") if isinstance(item, dict) else str(item)
                if model_id and model_id not in models:
                    models.append(model_id)
            if not models:
                errors.append(f"{endpoint} 未返回模型")
                continue
            return ModelCatalog(request_base, tuple(models), select_preferred_model(models))
        except urllib.error.HTTPError as exc:
            if exc.code in {401, 403}:
                raise ModelDiscoveryError(
                    f"{provider.label}拒绝了当前AI密钥（HTTP {exc.code}）。"
                    "请确认密钥属于这个服务商、没有多余空格且具有模型访问权限。"
                ) from exc
            errors.append(f"{endpoint} 返回HTTP {exc.code}")
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            errors.append(f"{endpoint} 访问失败：{exc}")

    raise ModelDiscoveryError(
        f"已识别为{provider.label}，但接口未提供可用模型列表。"
        "请在“AI模型”中填写服务商控制台给出的真实模型ID，再点击“验证AI”。\n"
        + "；".join(errors)
    )


def request_ai_text(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    timeout: int = 90,
    max_tokens: int | None = None,
    preferred_base_url: str | None = None,
    preferred_api_kind: str | None = None,
    fallback_timeout: int = 20,
    total_timeout: int | None = None,
    progress_callback: Callable[[str], None] | None = None,
    cancelled: Callable[[], bool] | None = None,
    max_retries: int = 0,
    retry_backoff_seconds: float = 1.0,
    reasoning_effort: str | None = None,
    _deadline: float | None = None,
) -> AITextResponse:
    normalized = normalize_api_base(base_url)
    if not normalized or not model.strip():
        raise AIRequestError("AI接口地址和模型不能为空")
    failures: list[_AttemptFailure] = []
    auth_errors: list[tuple[int, str, str]] = []
    provider = detect_ai_provider(normalized)
    if reasoning_effort not in {None, "minimal", "low", "medium", "high"}:
        raise AIRequestError("AI推理强度只能是minimal、low、medium或high")
    routes = _route_candidates(normalized, model, preferred_base_url, preferred_api_kind)
    started = monotonic()
    deadline = _deadline
    if deadline is None and total_timeout is not None:
        deadline = started + total_timeout
    for index, (candidate, api_kind, preferred) in enumerate(routes, start=1):
        if cancelled and cancelled():
            raise AIRequestCancelled("AI分析已取消")
        remaining = None if deadline is None else deadline - monotonic()
        if remaining is not None and remaining <= 0:
            failures.append(_AttemptFailure("timeout", f"{candidate}/{api_kind}"))
            break
        if api_kind in {"chat/completions", "messages"}:
            body = {
                "model": model.strip(),
                "messages": [{"role": "user", "content": prompt}],
                **(
                    {"max_tokens": max_tokens or 4096}
                    if api_kind == "messages"
                    else ({"max_tokens": max_tokens} if max_tokens else {})
                ),
                **(
                    {"reasoning_effort": reasoning_effort}
                    if reasoning_effort and api_kind == "chat/completions"
                    else {}
                ),
            }
        else:
            body = {
                "model": model.strip(),
                "input": prompt,
                **({"max_output_tokens": max_tokens} if max_tokens else {}),
                **({"reasoning": {"effort": reasoning_effort}} if reasoning_effort else {}),
            }
        endpoint = f"{candidate}/{api_kind}"
        # Give the most likely route enough time to generate a real answer. Compatibility
        # fallbacks are probes and must fail quickly instead of multiplying user wait time.
        attempt_timeout = timeout if preferred or index == 1 else min(timeout, max(1, fallback_timeout))
        if remaining is not None:
            attempt_timeout = min(attempt_timeout, max(0.1, remaining))
        if progress_callback:
            api_label = api_kind_label(api_kind)
            route_label = "已验证AI接口" if preferred else f"备用接口 {index}/{len(routes)}"
            progress_callback(f"正在请求{route_label} · {api_label}")
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers=_headers(
                api_key,
                content_type=True,
                provider=provider,
                api_kind=api_kind,
            ),
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=attempt_timeout) as response:
                text, usage = _read_ai_response(response, api_kind, endpoint)
            if cancelled and cancelled():
                raise AIRequestCancelled("AI分析已取消")
            return AITextResponse(
                text,
                candidate,
                model.strip(),
                api_kind,
                input_chars=len(prompt),
                output_chars=len(text),
                input_tokens=usage[0],
                output_tokens=usage[1],
                total_tokens=usage[2],
            )
        except AIRequestCancelled:
            raise
        except AIRequestError as exc:
            category = str(exc).partition("::")[0]
            failures.append(_AttemptFailure(category, endpoint))
        except urllib.error.HTTPError as exc:
            detail = _http_error(exc)
            if exc.code in {401, 403}:
                auth_errors.append((exc.code, api_kind, detail))
                continue
            if exc.code == 400 and reasoning_effort:
                if progress_callback:
                    progress_callback("当前网关不支持推理强度参数，正在使用同一模型兼容重试")
                return request_ai_text(
                    base_url,
                    api_key,
                    model,
                    prompt,
                    timeout=timeout,
                    max_tokens=max_tokens,
                    preferred_base_url=preferred_base_url,
                    preferred_api_kind=preferred_api_kind,
                    fallback_timeout=fallback_timeout,
                    total_timeout=total_timeout,
                    progress_callback=progress_callback,
                    cancelled=cancelled,
                    max_retries=max_retries,
                    retry_backoff_seconds=retry_backoff_seconds,
                    reasoning_effort=None,
                    _deadline=deadline,
                )
            failures.append(_AttemptFailure("http", endpoint, str(exc.code), detail))
            if exc.code in _RETRYABLE_HTTP_CODES:
                break
        except TimeoutError:
            failures.append(_AttemptFailure("timeout", endpoint))
            continue
        except urllib.error.URLError as exc:
            category = "timeout" if isinstance(exc.reason, TimeoutError) else "network"
            failures.append(_AttemptFailure(category, endpoint, cause=str(exc.reason)[:200]))
            if category == "timeout":
                continue
            break
        except OSError as exc:
            failures.append(_AttemptFailure("network", endpoint, cause=str(exc)[:200]))
            break
    if auth_errors and not failures:
        codes = {code for code, _, _ in auth_errors}
        detail = "；".join(
            f"{api_kind} HTTP {code}：{message}"
            for code, api_kind, message in auth_errors
        )
        if codes == {401}:
            raise AIRequestError(f"Key验证失败：{detail}")
        raise AIRequestError(f"Key、模型或接口权限验证失败：{detail}")
    if failures:
        message = _failure_summary(failures)
        categories = {failure.category for failure in failures}
        if "timeout" in categories and categories <= {"timeout", "http"}:
            raise AIRequestTimeout(message)
        if _has_retryable_failure(failures):
            if max_retries > 0:
                wait_seconds = max(0.0, retry_backoff_seconds)
                if deadline is not None:
                    remaining = deadline - monotonic()
                    if remaining <= 0:
                        raise AIRequestTimeout("AI服务在自动恢复期间超过总等待时间，请稍后重试。")
                    wait_seconds = min(wait_seconds, max(0.0, remaining - 0.1))
                if progress_callback:
                    progress_callback(
                        f"AI连接短暂中断，{wait_seconds:g}秒后自动重试（剩余{max_retries}次）"
                    )
                if wait_seconds:
                    sleep(wait_seconds)
                return request_ai_text(
                    base_url,
                    api_key,
                    model,
                    prompt,
                    timeout=timeout,
                    max_tokens=max_tokens,
                    preferred_base_url=preferred_base_url,
                    preferred_api_kind=preferred_api_kind,
                    fallback_timeout=fallback_timeout,
                    total_timeout=total_timeout,
                    progress_callback=progress_callback,
                    cancelled=cancelled,
                    max_retries=max_retries - 1,
                    retry_backoff_seconds=max(1.0, wait_seconds * 2),
                    reasoning_effort=reasoning_effort,
                    _deadline=deadline,
                )
            raise AITransientError(message)
        raise AIRequestError(message)
    raise AIRequestError("Key、模型或接口权限验证失败，请检查配置后重试。")


def verify_ai_connection(base_url: str, api_key: str, model: str) -> AITextResponse:
    return request_ai_text(
        base_url,
        api_key,
        model,
        "只回复OK",
        timeout=30,
        max_tokens=64,
        max_retries=1,
        retry_backoff_seconds=0.8,
        total_timeout=75,
    )
