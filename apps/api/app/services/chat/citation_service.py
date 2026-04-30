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
    seen_keys: set[tuple[Any, ...]] = set()
    for item in candidates:
        source_type = item.get("sourceType")
        source_url = item.get("sourceUrl")
        document_version_id = item.get("documentVersionId")
        document_id = item.get("documentId")
        key = (
            source_type,
            source_url or document_version_id or document_id or item.get("documentName"),
        )
        if key in seen_keys:
            continue
        seen_keys.add(key)
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
        if len(citations) >= citation_limit:
            break
    return citations
