from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = Path(__file__).resolve().parent / "rag_benchmark.jsonl"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "results" / "latest_rag_eval.json"
PASS_RATE_THRESHOLD = 0.80
GREETING_PASS_RATE_THRESHOLD = 1.00
LOAN_PASS_RATE_THRESHOLD = 0.80
NON_FALLBACK_FALLBACK_RATE_THRESHOLD = 0.20
AVG_LATENCY_MS_THRESHOLD = 15000


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                rows.append(json.loads(stripped))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL at {path}:{line_number}: {exc}") from exc
    return rows


def lower_text(value: Any) -> str:
    return str(value or "").lower()


def nested_get(payload: dict[str, Any], path: list[str], default: Any = None) -> Any:
    current: Any = payload
    for key in path:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
    return default if current is None else current


def extract_answer_text(response: dict[str, Any]) -> str:
    answer = response.get("answer")
    if isinstance(answer, dict):
        return str(answer.get("text") or "")
    return str(answer or "")


def extract_retrieval(response: dict[str, Any]) -> dict[str, Any]:
    trace = response.get("trace") if isinstance(response.get("trace"), dict) else {}
    retrieval = trace.get("retrieval") if isinstance(trace.get("retrieval"), dict) else {}
    return retrieval


def extract_llm_executed(response: dict[str, Any]) -> bool:
    trace = response.get("trace") if isinstance(response.get("trace"), dict) else {}
    return bool(
        nested_get(trace, ["llm", "executed"], nested_get(trace, ["model", "executed"], False))
    )


def is_fallback(response: dict[str, Any]) -> bool:
    outcome = str(response.get("outcome") or "")
    trace = response.get("trace") if isinstance(response.get("trace"), dict) else {}
    message_type = str(trace.get("messageType") or "")
    fallback_reason = str(trace.get("fallbackReason") or "")
    retrieval_reason = str(nested_get(trace, ["retrieval", "fallbackReason"], ""))
    if outcome in {"insufficient_evidence", "restricted", "conflict", "escalate"}:
        return True
    if message_type in {"fallback", "clarification"}:
        return True
    return any(reason and reason != "NONE" for reason in [fallback_reason, retrieval_reason])


def extract_source_text(response: dict[str, Any]) -> str:
    parts: list[str] = []
    citations = response.get("citations") if isinstance(response.get("citations"), list) else []
    for citation in citations:
        if isinstance(citation, dict):
            parts.extend(
                str(citation.get(key) or "")
                for key in ["section_title", "sectionTitle", "document_name", "documentName", "source_url", "sourceUrl"]
            )
    retrieval = extract_retrieval(response)
    chunks = retrieval.get("chunks") if isinstance(retrieval.get("chunks"), list) else []
    for chunk in chunks:
        if isinstance(chunk, dict):
            parts.extend(
                str(chunk.get(key) or "")
                for key in ["sectionTitle", "sourceTitle", "sourceUrl", "preview"]
            )
    return " ".join(parts).lower()


def keyword_hits(text: str, expected_keywords: list[str]) -> list[str]:
    lowered = text.lower()
    return [keyword for keyword in expected_keywords if keyword.lower() in lowered]


def source_hits(response: dict[str, Any], expected_source_terms: list[str]) -> list[str]:
    source_text = extract_source_text(response)
    return [term for term in expected_source_terms if term.lower() in source_text]


def call_http(
    *,
    base_url: str,
    token: str,
    chatbot_id: str,
    question: str,
    top_k: int,
    timeout: int,
) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}/admin/chatbots/{chatbot_id}/test-chat"
    body = json.dumps(
        {
            "chatbot_id": chatbot_id,
            "question": question,
            "top_k": top_k,
            "session_token": f"rag-eval-{uuid.uuid4()}",
        }
    ).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {detail[:1000]}") from exc
    except URLError as exc:
        raise RuntimeError(f"HTTP request failed: {exc}") from exc


def call_internal(*, chatbot_id: str, question: str, top_k: int) -> dict[str, Any]:
    sys.path.insert(0, str(ROOT))
    from app.db import SessionLocal
    from app.schemas.chat_policy import PreAnswerRequest
    from app.services.chat.final_chat_pipeline_service import run_final_chat_pipeline

    with SessionLocal() as db:
        body = PreAnswerRequest(
            chatbot_id=chatbot_id,
            question=question,
            top_k=top_k,
            session_token=f"rag-eval-{uuid.uuid4()}",
        )
        response = run_final_chat_pipeline(
            db,
            body=body,
            stream_mode="admin_test",
            include_debug_trace=True,
        )
        return response.model_dump(by_alias=True)


def call_dry_run(row: dict[str, Any]) -> dict[str, Any]:
    should_fallback = bool(row.get("should_fallback"))
    answer_text = " ".join(row.get("expected_keywords") or []) or "평가 dry-run 응답"
    if should_fallback:
        answer_text = "등록된 지식 범위에서 확인하기 어려운 질문입니다."
    source_terms = " ".join(row.get("expected_source_terms") or [])
    return {
        "outcome": "insufficient_evidence" if should_fallback else "answered",
        "answer": {"text": answer_text, "warnings": []},
        "citations": [
            {
                "section_title": source_terms,
                "score": 0.8,
            }
        ]
        if source_terms
        else [],
        "trace": {
            "messageType": "fallback" if should_fallback else "rag",
            "fallbackReason": "OUT_OF_SCOPE" if should_fallback else "NONE",
            "latencyMs": 1,
            "retrieval": {
                "usedInPromptCount": 0 if should_fallback else 1,
                "topScore": None if should_fallback else 0.8,
                "chunks": [{"sectionTitle": source_terms, "preview": answer_text}],
            },
            "llm": {"executed": not should_fallback},
        },
    }


def evaluate_case(row: dict[str, Any], response: dict[str, Any], latency_ms: int) -> dict[str, Any]:
    answer_text = extract_answer_text(response)
    retrieval = extract_retrieval(response)
    expected_keywords = list(row.get("expected_keywords") or [])
    expected_source_terms = list(row.get("expected_source_terms") or [])
    hits = keyword_hits(answer_text, expected_keywords)
    src_hits = source_hits(response, expected_source_terms)
    fallback = is_fallback(response)
    should_fallback = bool(row.get("should_fallback"))
    used_in_prompt_count = int(retrieval.get("usedInPromptCount") or 0)
    top_score = retrieval.get("topScore")
    llm_executed = extract_llm_executed(response)

    if should_fallback:
        passed = fallback
    else:
        keyword_ok = not expected_keywords or len(hits) >= max(1, len(expected_keywords) // 2)
        source_ok = not expected_source_terms or bool(src_hits)
        retrieval_ok = used_in_prompt_count >= 1 or row.get("category") in {"greeting", "ambiguous"}
        llm_ok = llm_executed or row.get("category") in {"greeting", "ambiguous"}
        passed = (not fallback) and keyword_ok and source_ok and retrieval_ok and llm_ok

    return {
        "id": row.get("id"),
        "question": row.get("question"),
        "category": row.get("category"),
        "passed": passed,
        "answer": answer_text,
        "citations": response.get("citations") or [],
        "trace": response.get("trace") or {},
        "expectedKeywords": expected_keywords,
        "keywordHits": hits,
        "expectedSourceTerms": expected_source_terms,
        "sourceTermHits": src_hits,
        "shouldFallback": should_fallback,
        "fallback": fallback,
        "usedInPromptCount": used_in_prompt_count,
        "topScore": top_score,
        "llmExecuted": llm_executed,
        "latencyMs": latency_ms,
    }


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(results)
    pass_count = sum(1 for item in results if item.get("passed"))
    fallback_count = sum(1 for item in results if item.get("fallback"))
    top_scores = [
        float(item["topScore"])
        for item in results
        if isinstance(item.get("topScore"), (int, float)) and not isinstance(item.get("topScore"), bool)
    ]
    non_fallback_cases = [item for item in results if not item.get("shouldFallback")]
    non_fallback_fallbacks = sum(1 for item in non_fallback_cases if item.get("fallback"))
    by_category: dict[str, dict[str, Any]] = {}
    for item in results:
        category = str(item.get("category") or "unknown")
        bucket = by_category.setdefault(category, {"total": 0, "pass_count": 0, "pass_rate": 0.0})
        bucket["total"] += 1
        if item.get("passed"):
            bucket["pass_count"] += 1
    for bucket in by_category.values():
        bucket["pass_rate"] = bucket["pass_count"] / bucket["total"] if bucket["total"] else 0.0

    summary = {
        "total": total,
        "pass_count": pass_count,
        "pass_rate": pass_count / total if total else 0.0,
        "fallback_rate": fallback_count / total if total else 0.0,
        "non_fallback_fallback_rate": (
            non_fallback_fallbacks / len(non_fallback_cases) if non_fallback_cases else 0.0
        ),
        "avg_latency_ms": (
            sum(int(item.get("latencyMs") or 0) for item in results) / total if total else 0.0
        ),
        "avg_top_score": sum(top_scores) / len(top_scores) if top_scores else None,
        "by_category": by_category,
        "failed_cases": [
            {
                "id": item.get("id"),
                "category": item.get("category"),
                "question": item.get("question"),
                "fallback": item.get("fallback"),
                "usedInPromptCount": item.get("usedInPromptCount"),
                "topScore": item.get("topScore"),
                "keywordHits": item.get("keywordHits"),
                "sourceTermHits": item.get("sourceTermHits"),
            }
            for item in results
            if not item.get("passed")
        ],
    }
    greeting_rate = by_category.get("greeting", {}).get("pass_rate", 0.0)
    loan_rate = by_category.get("loan", {}).get("pass_rate", 0.0)
    summary["quality_gate"] = {
        "passed": (
            summary["pass_rate"] >= PASS_RATE_THRESHOLD
            and greeting_rate >= GREETING_PASS_RATE_THRESHOLD
            and loan_rate >= LOAN_PASS_RATE_THRESHOLD
            and summary["non_fallback_fallback_rate"] <= NON_FALLBACK_FALLBACK_RATE_THRESHOLD
            and summary["avg_latency_ms"] <= AVG_LATENCY_MS_THRESHOLD
        ),
        "criteria": {
            "pass_rate_min": PASS_RATE_THRESHOLD,
            "greeting_pass_rate_min": GREETING_PASS_RATE_THRESHOLD,
            "loan_pass_rate_min": LOAN_PASS_RATE_THRESHOLD,
            "non_fallback_fallback_rate_max": NON_FALLBACK_FALLBACK_RATE_THRESHOLD,
            "avg_latency_ms_max": AVG_LATENCY_MS_THRESHOLD,
        },
    }
    return summary


def run(args: argparse.Namespace) -> dict[str, Any]:
    dataset = load_jsonl(Path(args.dataset))
    if args.limit:
        dataset = dataset[: args.limit]
    chatbot_id = args.chatbot_id or os.getenv("IEUMBOT_CHATBOT_ID") or os.getenv("CHATBOT_ID")
    if args.mode != "dry-run" and not chatbot_id:
        raise SystemExit("chatbot_id is required. Use --chatbot-id or IEUMBOT_CHATBOT_ID.")

    token = args.admin_token or os.getenv("IEUMBOT_ADMIN_TOKEN") or os.getenv("ADMIN_TOKEN")
    if args.mode == "http" and not token:
        raise SystemExit("admin token is required for http mode. Use --admin-token or IEUMBOT_ADMIN_TOKEN.")

    results: list[dict[str, Any]] = []
    for index, row in enumerate(dataset, start=1):
        started = time.perf_counter()
        error: str | None = None
        try:
            if args.mode == "dry-run":
                response = call_dry_run(row)
            elif args.mode == "internal":
                response = call_internal(
                    chatbot_id=str(chatbot_id),
                    question=str(row["question"]),
                    top_k=args.top_k,
                )
            else:
                response = call_http(
                    base_url=args.base_url,
                    token=str(token),
                    chatbot_id=str(chatbot_id),
                    question=str(row["question"]),
                    top_k=args.top_k,
                    timeout=args.timeout,
                )
        except Exception as exc:
            response = {
                "outcome": "error",
                "answer": {"text": ""},
                "citations": [],
                "trace": {"messageType": "error", "fallbackReason": "EVAL_REQUEST_ERROR"},
            }
            error = str(exc)
        latency_ms = int((time.perf_counter() - started) * 1000)
        result = evaluate_case(row, response, latency_ms)
        if error:
            result["error"] = error
            result["passed"] = False
        results.append(result)
        status = "PASS" if result["passed"] else "FAIL"
        print(f"[{index:03d}/{len(dataset):03d}] {status} {row['id']} {row['category']} {latency_ms}ms")

    summary = summarize(results)
    output = {
        "metadata": {
            "dataset": str(Path(args.dataset)),
            "mode": args.mode,
            "chatbot_id": chatbot_id,
            "base_url": args.base_url if args.mode == "http" else None,
            "top_k": args.top_k,
            "created_at_unix": int(time.time()),
        },
        "summary": summary,
        "results": results,
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Saved: {output_path}")
    return output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run IEUMBOT RAG benchmark.")
    parser.add_argument("--chatbot-id", default=None, help="Target chatbot id. Env: IEUMBOT_CHATBOT_ID")
    parser.add_argument(
        "--mode",
        choices=["http", "internal", "dry-run"],
        default=os.getenv("IEUMBOT_EVAL_MODE", "http"),
        help="http calls admin test-chat, internal calls the local pipeline, dry-run uses synthetic responses.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("IEUMBOT_API_BASE_URL", "http://localhost:8000/api"),
        help="API base URL for http mode. Env: IEUMBOT_API_BASE_URL",
    )
    parser.add_argument("--admin-token", default=None, help="Bearer token for http mode. Env: IEUMBOT_ADMIN_TOKEN")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET), help="JSONL benchmark file path.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Result JSON output path.")
    parser.add_argument("--limit", type=int, default=None, help="Run only the first N rows.")
    parser.add_argument("--top-k", type=int, default=8, help="Retrieval top_k sent to chat runtime.")
    parser.add_argument("--timeout", type=int, default=60, help="HTTP request timeout seconds.")
    return parser.parse_args()


if __name__ == "__main__":
    run(parse_args())
