"""
feedback_stats_service.py
사용자 피드백(👍👎) 집계 서비스.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def get_feedback_summary(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str | None = None,
) -> dict[str, Any]:
    """전체 피드백 현황 집계 (집계 A)"""
    params: dict[str, Any] = {"organization_id": organization_id}
    chatbot_filter = ""
    if chatbot_id:
        chatbot_filter = "AND chatbot_id = :chatbot_id"
        params["chatbot_id"] = chatbot_id

    row = db.execute(text(f"""
        SELECT
            COUNT(*)                                        AS total,
            COUNT(user_feedback)                            AS received,
            COUNT(*) FILTER (WHERE user_feedback = 1)      AS thumbs_up,
            COUNT(*) FILTER (WHERE user_feedback = -1)     AS thumbs_down,
            ROUND(
                COUNT(*) FILTER (WHERE user_feedback = 1)::NUMERIC
                / NULLIF(COUNT(user_feedback), 0) * 100, 2
            )                                               AS positive_rate
        FROM chat_messages
        WHERE organization_id = :organization_id
          AND role = 'assistant'
          {chatbot_filter}
    """), params).fetchone()

    return {
        "totalAssistantMessages": int(row.total or 0),
        "feedbackReceived":       int(row.received or 0),
        "thumbsUp":               int(row.thumbs_up or 0),
        "thumbsDown":             int(row.thumbs_down or 0),
        "positiveRate":           float(row.positive_rate or 0),
    }


def list_low_rated_messages(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    """낮은 평점 메시지 목록 + 총 수 (집계 B)"""
    params: dict[str, Any] = {
        "organization_id": organization_id,
        "limit": limit,
        "offset": offset,
    }
    chatbot_filter = ""
    if chatbot_id:
        chatbot_filter = "AND chatbot_id = :chatbot_id"
        params["chatbot_id"] = chatbot_id

    rows = db.execute(text(f"""
        SELECT id, normalized_query, content, feedback_at, created_at
        FROM chat_messages
        WHERE organization_id = :organization_id
          AND role = 'assistant'
          AND user_feedback = -1
          {chatbot_filter}
        ORDER BY feedback_at DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """), params).fetchall()

    total_row = db.execute(text(f"""
        SELECT COUNT(*) AS cnt
        FROM chat_messages
        WHERE organization_id = :organization_id
          AND role = 'assistant'
          AND user_feedback = -1
          {chatbot_filter}
    """), params).fetchone()

    return {
        "total": int(total_row.cnt or 0),
        "items": [
            {
                "messageId":       str(r.id),
                "normalizedQuery": r.normalized_query or "",
                "content":         (r.content or "")[:300],
                "feedbackAt":      r.feedback_at.isoformat() if r.feedback_at else None,
                "createdAt":       r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }


def get_feedback_by_document(
    db: Session,
    *,
    organization_id: str,
    chatbot_id: str | None = None,
) -> list[dict[str, Any]]:
    """문서별 피드백 집계 (집계 C)"""
    params: dict[str, Any] = {"organization_id": organization_id}
    chatbot_filter = ""
    if chatbot_id:
        chatbot_filter = "AND cm.chatbot_id = :chatbot_id"
        params["chatbot_id"] = chatbot_id

    rows = db.execute(text(f"""
        SELECT
            source->>'documentName'                                   AS document_name,
            source->>'documentId'                                     AS document_id,
            COUNT(*) FILTER (WHERE cm.user_feedback = 1)              AS thumbs_up,
            COUNT(*) FILTER (WHERE cm.user_feedback = -1)             AS thumbs_down,
            COUNT(*) FILTER (WHERE cm.user_feedback IS NOT NULL)      AS total_feedback,
            ROUND(
                COUNT(*) FILTER (WHERE cm.user_feedback = 1)::NUMERIC
                / NULLIF(COUNT(*) FILTER (WHERE cm.user_feedback IS NOT NULL), 0) * 100,
                2
            )                                                          AS positive_rate
        FROM chat_messages cm,
             jsonb_array_elements(cm.selected_sources) AS source
        WHERE cm.organization_id = :organization_id
          AND cm.role = 'assistant'
          AND cm.user_feedback IS NOT NULL
          AND cm.selected_sources IS NOT NULL
          AND source->>'documentName' IS NOT NULL
          {chatbot_filter}
        GROUP BY source->>'documentName', source->>'documentId'
        ORDER BY total_feedback DESC
        LIMIT 50
    """), params).fetchall()

    return [
        {
            "documentName":  r.document_name,
            "documentId":    r.document_id,
            "thumbsUp":      int(r.thumbs_up or 0),
            "thumbsDown":    int(r.thumbs_down or 0),
            "totalFeedback": int(r.total_feedback or 0),
            "positiveRate":  float(r.positive_rate or 0),
        }
        for r in rows
    ]
