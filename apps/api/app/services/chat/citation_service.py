from typing import Any


def assemble_citations(
    *,
    candidates: list[dict[str, Any]],
    citation_display_mode: str,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    if citation_display_mode == "hidden":
        return []

    citation_limit = 2 if citation_display_mode == "compact" else min(top_k, 5)
    citations: list[dict[str, Any]] = []
    for item in candidates[:citation_limit]:
        citations.append(
            {
                "documentId": item.get("documentId"),
                "documentName": item.get("documentName"),
                "documentVersionId": item.get("documentVersionId"),
                "pageNumber": item.get("pageNumber"),
                "sectionTitle": item.get("sectionTitle"),
                "sourceType": item.get("sourceType"),
                "sourceUrl": item.get("sourceUrl"),
                "finalRank": item.get("finalRank"),
                "score": item.get("combinedScore"),
                "selectionReason": "retrieval_rank_selected",
            }
        )
    return citations
