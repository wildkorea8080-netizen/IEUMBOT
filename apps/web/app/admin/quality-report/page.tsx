"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileEdit } from "lucide-react";

import { ApiClientError } from "../../../lib/api";
import {
  estimateQualityBackfill,
  getAdminChatbots,
  getAdminQualityReport,
  runQualityBackfill,
} from "../../../lib/api/admin-operations";
import type {
  AdminChatbotItem,
  AdminQualityQuestionItem,
  AdminQualityReportResponse,
} from "../../../lib/api/admin-operations-types";

function rangeDate(days: number): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "품질 리포트를 불러오지 못했습니다.";
}

/** CSV 한 칸. 쉼표·따옴표·줄바꿈이 있으면 감싸고 내부 따옴표는 두 번 쓴다. */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * 품질 리포트를 CSV 한 장으로 만든다.
 *
 * 요약 지표와 문제 질문 목록을 한 파일에 섹션으로 나눠 담는다. 상급자 보고나
 * 평가 증빙으로 붙일 때 엑셀에서 바로 열려야 하므로 시트를 쪼개지 않는다.
 */
function buildQualityCsv(
  report: AdminQualityReportResponse,
  meta: { chatbotName: string; startDate: string; endDate: string },
): string {
  const lines: string[] = [];
  const answeredRate = report.totalConversations
    ? (report.answeredCount / report.totalConversations) * 100
    : 0;

  lines.push(csvRow(["품질 리포트"]));
  lines.push(csvRow(["챗봇", meta.chatbotName]));
  lines.push(csvRow(["기간", `${meta.startDate} ~ ${meta.endDate}`]));
  lines.push(csvRow(["생성 시각", new Date().toLocaleString("ko-KR")]));
  lines.push("");

  lines.push(csvRow(["운영 지표 (챗봇 자체 판정)"]));
  lines.push(csvRow(["항목", "값"]));
  lines.push(csvRow(["총 대화 수", report.totalConversations]));
  lines.push(csvRow(["답변 성공률(%)", answeredRate.toFixed(1)]));
  lines.push(csvRow(["답변 건수", report.answeredCount]));
  lines.push(csvRow(["Fallback 비율(%)", report.fallbackRate ?? ""]));
  lines.push(csvRow(["Fallback 건수", report.fallbackCount]));
  lines.push(csvRow(["평균 응답시간(ms)", report.avgLatencyMs ?? ""]));
  lines.push(csvRow(["평균 topScore", report.avgTopScore ?? ""]));
  lines.push(csvRow(["LLM 실행률(%)", report.llmExecutedRate ?? ""]));
  lines.push("");

  const quality = report.answerQuality;
  if (quality?.enabled) {
    lines.push(csvRow(["AI 답변 품질 (LLM 채점)"]));
    lines.push(csvRow(["채점 모델", quality.evaluatorModel ?? ""]));
    lines.push(csvRow(["채점 기준", quality.promptVersion ?? ""]));
    lines.push(csvRow(["채점 건수", quality.total]));
    lines.push(csvRow(["항목", "평균", "통과율(%)"]));
    lines.push(csvRow(["답변 적합성", quality.relevance.average ?? "", quality.relevance.passRate ?? ""]));
    lines.push(csvRow(["문서 근거성", quality.groundedness.average ?? "", quality.groundedness.passRate ?? ""]));
    lines.push(csvRow(["대화 맥락 유지", quality.context.average ?? "", quality.context.passRate ?? ""]));
    lines.push(csvRow(["추천질문 적합성", quality.followup.average ?? "", quality.followup.passRate ?? ""]));
    lines.push(csvRow(["주제 이탈(%)", quality.topicDriftRate ?? ""]));
    lines.push(csvRow(["검토 필요(건)", quality.needsReviewCount]));
    lines.push("");
  }

  const sections: [string, AdminQualityQuestionItem[]][] = [
    ["최근 실패 질문", report.recentFailedQuestions],
    ["낮은 점수 질문", report.lowScoreQuestions],
    ["출처 없는 답변", report.noCitationAnswers],
  ];
  for (const [title, rows] of sections) {
    lines.push(csvRow([title, `${rows.length}건`]));
    lines.push(csvRow(["시간", "질문", "상태", "사유", "점수", "프롬프트", "출처"]));
    for (const row of rows) {
      lines.push(
        csvRow([
          row.createdAt ?? "",
          row.question ?? "",
          row.outcome ?? "",
          row.fallbackReason ?? "",
          row.topScore ?? "",
          row.usedInPromptCount ?? 0,
          row.retrievedCount ?? 0,
        ]),
      );
    }
    lines.push("");
  }

  if (report.topFallbackReasons.length > 0) {
    lines.push(csvRow(["Fallback 원인"]));
    lines.push(csvRow(["사유", "건수"]));
    for (const item of report.topFallbackReasons) {
      lines.push(csvRow([item.reason, item.count]));
    }
  }

  return lines.join("\r\n");
}

/** 엑셀은 BOM 이 없으면 UTF-8 한글을 깨뜨린다. */
function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function fmt(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toLocaleString("ko-KR");
}
function fmtPct(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(1)}%`;
}
function fmtScore(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return value.toFixed(3);
}
function fmtLatency(value?: number | null): string {
  if (typeof value !== "number") return "-";
  return `${Math.round(value).toLocaleString("ko-KR")}ms`;
}
function fmtDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function scoreColor(score?: number | null): string {
  if (typeof score !== "number") return "#94a3b8";
  if (score >= 0.7) return "#16a34a";
  if (score >= 0.45) return "#d97706";
  return "#dc2626";
}
function outcomeClass(outcome?: string | null): string {
  if (!outcome) return "badge-neutral";
  if (outcome === "answered") return "badge-success";
  if (outcome === "insufficient_evidence") return "badge-warning";
  if (outcome === "escalated") return "badge-info";
  return "badge-danger";
}

type MetricCardProps = { label: string; value: string; helper?: string; color?: "default" | "green" | "red" | "orange" };
function MetricCard({ label, value, helper, color = "default" }: MetricCardProps) {
  const bg = color === "green" ? "#f0fdf4" : color === "red" ? "#fef2f2" : color === "orange" ? "#fffbeb" : "white";
  const border = color === "green" ? "#bbf7d0" : color === "red" ? "#fecaca" : color === "orange" ? "#fde68a" : "#e2e8f0";
  const valueColor = color === "green" ? "#16a34a" : color === "red" ? "#dc2626" : color === "orange" ? "#d97706" : "#0f172a";
  return (
    <article style={{ borderRadius: 12, border: `1px solid ${border}`, background: bg, padding: 16 }}>
      <p style={{ fontSize: 12, color: "#64748b" }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: valueColor, marginTop: 6 }}>{value}</p>
      {helper && <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{helper}</p>}
    </article>
  );
}

function QuestionTable({ title, description, rows, emptyText }: { title: string; description: string; rows: AdminQualityQuestionItem[]; emptyText: string }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", margin: 0 }}>{title}</h3>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{description}</p>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th className="table-header" style={{ width: 100 }}>시간</th>
            <th className="table-header">질문</th>
            <th className="table-header" style={{ width: 100 }}>상태</th>
            <th className="table-header" style={{ width: 80 }}>점수</th>
            <th className="table-header" style={{ width: 64 }}>프롬프트</th>
            <th className="table-header" style={{ width: 64 }}>출처</th>
            <th className="table-header" style={{ width: 72 }}>지식 등록</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="table-cell" style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>{emptyText}</td></tr>
          ) : (
            rows.map((item, i) => (
              <tr key={`${item.createdAt}-${i}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td className="table-cell" style={{ color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(item.createdAt)}</td>
                <td className="table-cell">
                  <p style={{ color: "#1e293b", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.question ?? "-"}</p>
                  {item.fallbackReason && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>{item.fallbackReason}</p>}
                </td>
                <td className="table-cell"><span className={outcomeClass(item.outcome)}>{item.outcome ?? "-"}</span></td>
                <td className="table-cell" style={{ color: scoreColor(item.topScore), fontWeight: 600 }}>{fmtScore(item.topScore)}</td>
                <td className="table-cell" style={{ textAlign: "center", color: "#475569" }}>{fmt(item.usedInPromptCount)}</td>
                <td className="table-cell" style={{ textAlign: "center", color: "#475569" }}>{fmt(item.citationCount)}</td>
                <td className="table-cell">
                  <Link href={`/admin/knowledge?q=${encodeURIComponent(item.question ?? "")}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563eb", textDecoration: "none" }}>
                    <FileEdit style={{ width: 13, height: 13 }} />등록
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminQualityReportPage() {
  const initialRange = useMemo(() => rangeDate(30), []);
  const [report, setReport] = useState<AdminQualityReportResponse | null>(null);
  const [chatbots, setChatbots] = useState<AdminChatbotItem[]>([]);
  const [chatbotId, setChatbotId] = useState("");
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [fallbackOnly, setFallbackOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backfillInfo, setBackfillInfo] = useState<string | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);

  async function loadReport() {
    setIsLoading(true); setError(null);
    try {
      const [reportRes, chatbotRes] = await Promise.all([
        getAdminQualityReport({ chatbotId: chatbotId || undefined, startDate, endDate, fallbackOnly }),
        getAdminChatbots(),
      ]);
      setReport(reportRes); setChatbots(chatbotRes.items);
    } catch (err) { setError(errorMessage(err)); }
    finally { setIsLoading(false); }
  }

  useEffect(() => { void loadReport(); }, []);

  const answeredRate = report?.totalConversations ? (report.answeredCount / report.totalConversations) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-neutral-200 p-4">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <select value={chatbotId} onChange={e => setChatbotId(e.target.value)} className="input-field" style={{ width: 180 }}>
            <option value="">전체 챗봇</option>
            {chatbots.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field" style={{ width: 148 }} aria-label="시작일" />
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-field" style={{ width: 148 }} aria-label="종료일" />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={fallbackOnly} onChange={e => setFallbackOnly(e.target.checked)} style={{ width: 15, height: 15, accentColor: "#2563eb" }} />fallback만 보기
          </label>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: "8px 16px", marginLeft: "auto" }}
            disabled={!report || report.totalConversations === 0}
            onClick={() => {
              if (!report) return;
              const name = chatbots.find(c => c.id === chatbotId)?.name ?? "전체 챗봇";
              downloadCsv(
                `품질리포트_${name}_${startDate}_${endDate}.csv`,
                buildQualityCsv(report, { chatbotName: name, startDate, endDate }),
              );
            }}
          >
            CSV 내려받기
          </button>
          <button type="button" onClick={() => void loadReport()} className="btn-primary" style={{ padding: "8px 20px" }}>조회</button>
        </div>
        {error && <p style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, color: "#dc2626" }}>{error}</p>}
        {isLoading && <p style={{ marginTop: 12, fontSize: 13, color: "#94a3b8" }}>품질 데이터를 불러오는 중...</p>}
        {!isLoading && report?.totalConversations === 0 && <div style={{ marginTop: 12, padding: "32px 0", textAlign: "center", fontSize: 13, color: "#94a3b8", background: "#f8fafc", borderRadius: 8 }}>분석할 대화 데이터가 없습니다.</div>}
      </div>

      {report && report.totalConversations > 0 && (
        <>
          <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
            아래 지표는 챗봇이 스스로 남긴 처리 결과 기준입니다.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <MetricCard label="총 대화 수" value={fmt(report.totalConversations)} />
            <MetricCard label="답변 성공률" value={fmtPct(answeredRate)} helper={`${fmt(report.answeredCount)}건 답변`} color={answeredRate >= 70 ? "green" : answeredRate >= 50 ? "orange" : "red"} />
            <MetricCard label="Fallback 비율" value={fmtPct(report.fallbackRate)} helper={`${fmt(report.fallbackCount)}건`} color={report.fallbackRate != null && report.fallbackRate >= 30 ? "red" : "default"} />
            <MetricCard label="평균 응답시간" value={fmtLatency(report.avgLatencyMs)} />
            <MetricCard label="평균 topScore" value={fmtScore(report.avgTopScore)} color={report.avgTopScore != null && report.avgTopScore >= 0.7 ? "green" : report.avgTopScore != null && report.avgTopScore >= 0.45 ? "orange" : "red"} />
            <MetricCard label="LLM 실행률" value={fmtPct(report.llmExecutedRate)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
            <div>
              <QuestionTable title="최근 실패 질문" description="fallback·제한·충돌·이관으로 종료된 최근 질문입니다." rows={report.recentFailedQuestions} emptyText="최근 실패 질문이 없습니다." />
              <QuestionTable title="낮은 점수 질문" description="답변은 생성됐지만 retrieval topScore가 낮은 질문입니다." rows={report.lowScoreQuestions} emptyText="낮은 점수 질문이 없습니다." />
              <QuestionTable title="출처 없는 답변" description="답변은 성공했지만 citation이 저장되지 않은 항목입니다." rows={report.noCitationAnswers} emptyText="출처 없는 답변이 없습니다." />
            </div>
            <div className="bg-white rounded-xl border border-neutral-200" style={{ overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", margin: 0 }}>Fallback 원인 TOP</h3>
              </div>
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {report.topFallbackReasons.length === 0 ? (
                  <p style={{ textAlign: "center", fontSize: 13, color: "#94a3b8", padding: "24px 0" }}>fallback 데이터가 없습니다.</p>
                ) : report.topFallbackReasons.map(item => (
                  <div key={item.reason} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <p style={{ fontSize: 13, color: "#334155", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{item.reason}</p>
                    <span style={{ flexShrink: 0, background: "#e0e7ff", color: "#3730a3", borderRadius: 99, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>{fmt(item.count)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {report?.answerQuality && (
        <section style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>AI 답변 품질</h2>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {report.answerQuality.evaluatorModel ?? "-"} · 기준 {report.answerQuality.promptVersion ?? "-"} · n={report.answerQuality.total}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0 16px" }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={!chatbotId || isBackfilling}
              onClick={async () => {
                if (!chatbotId) return;
                setIsBackfilling(true);
                try {
                  const est = await estimateQualityBackfill(chatbotId, startDate, endDate);
                  if (est.targetCount === 0) {
                    setBackfillInfo("이 기간에 평가할 대화가 없습니다.");
                    return;
                  }
                  const won = Math.round(est.estimatedCostUsd * 1400).toLocaleString();
                  const cappedNote = est.capped
                    ? "\n\n주의: 대상 건수가 일일 처리 상한(5,000건)에서 잘린 값입니다. 실제 대상은 이보다 많을 수 있습니다."
                    : "";
                  if (!confirm(`${est.targetCount}건을 평가합니다. 예상 비용 약 ${won}원.${cappedNote}\n진행할까요?`)) return;
                  // 실행은 즉시 끝나지 않는다 — 서버가 워커 큐에 넣기만 하고 반환한다.
                  // 채점 자체는 백그라운드에서 진행되므로 여기서 완료 건수를 알 수 없다.
                  const result = await runQualityBackfill(chatbotId, startDate, endDate);
                  setBackfillInfo(
                    `평가를 시작했습니다 — ${result.targetCount}건. 완료되면 이 화면에 반영됩니다. 잠시 후 새로고침해 주세요.`,
                  );
                } catch (e) {
                  setBackfillInfo(errorMessage(e));
                } finally {
                  setIsBackfilling(false);
                }
              }}
            >
              {isBackfilling ? "평가 중..." : "과거 구간 평가"}
            </button>
            {backfillInfo && <span style={{ fontSize: 12, color: "#64748b" }}>{backfillInfo}</span>}
          </div>

          {!report.answerQuality.enabled ? (
            <div style={{ padding: 20, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, color: "#475569" }}>
              아직 평가 결과가 없습니다. <strong>대화 스타일 설정 → 답변 품질 자동 평가</strong>를 켜면
              다음 날 새벽부터 채점이 시작됩니다. 과거 구간은 위 &ldquo;과거 구간 평가&rdquo;로 채울 수 있습니다.
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {([
                  ["답변 적합성", report.answerQuality.relevance],
                  ["문서 근거성", report.answerQuality.groundedness],
                  ["대화 맥락 유지", report.answerQuality.context],
                  ["추천질문 적합성", report.answerQuality.followup],
                ] as const).map(([label, metric]) => (
                  <div key={label} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 13, color: "#64748b" }}>{label}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
                      {metric.passRate === null ? "데이터 없음" : `${metric.passRate}%`}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                      {metric.average === null ? "—" : `평균 ${metric.average}점`} · n={metric.sampleSize}
                    </div>
                  </div>
                ))}
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 13, color: "#64748b" }}>주제 이탈</div>
                  <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>
                    {report.answerQuality.topicDriftRate === null ? "데이터 없음" : `${report.answerQuality.topicDriftRate}%`}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>낮을수록 좋음</div>
                </div>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 13, color: "#64748b" }}>검토 필요</div>
                  <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{report.answerQuality.needsReviewCount}건</div>
                </div>
              </div>

              <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>
                판정 구성: AI 채점 {report.answerQuality.llmCount}건 · 규칙 확정 {report.answerQuality.ruleCount}건 · 실패 {report.answerQuality.failedCount}건 · 지출 약 {Math.round(report.answerQuality.costUsdTotal * 1400).toLocaleString()}원
              </p>

              {report.answerQuality.weekly.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>주간 추이</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ padding: "6px 8px" }}>주 시작</th>
                        <th style={{ padding: "6px 8px" }}>건수</th>
                        <th style={{ padding: "6px 8px" }}>적합성</th>
                        <th style={{ padding: "6px 8px" }}>근거성</th>
                        <th style={{ padding: "6px 8px" }}>맥락</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.answerQuality.weekly.map(week => (
                        <tr
                          key={week.bucketStart}
                          style={{ borderBottom: "1px solid #f1f5f9", opacity: week.reliable ? 1 : 0.45 }}
                          title={week.reliable ? undefined : "표본 30건 미만 — 신뢰하기 어려운 값입니다"}
                        >
                          <td style={{ padding: "6px 8px" }}>{week.bucketStart}</td>
                          <td style={{ padding: "6px 8px" }}>{week.total}</td>
                          <td style={{ padding: "6px 8px" }}>{week.relevancePassRate === null ? "—" : `${week.relevancePassRate}%`}</td>
                          <td style={{ padding: "6px 8px" }}>{week.groundednessPassRate === null ? "—" : `${week.groundednessPassRate}%`}</td>
                          <td style={{ padding: "6px 8px" }}>{week.contextPassRate === null ? "—" : `${week.contextPassRate}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
                    흐리게 표시된 주는 표본이 30건 미만이라 수치가 흔들립니다.
                  </p>
                </div>
              )}

              {report.answerQuality.reviewItems.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>검토 필요 목록</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {report.answerQuality.reviewItems.map(item => (
                      <div key={item.messageId} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{item.question || "(질문 미기록)"}</span>
                          {item.failedMetrics.map(m => (
                            <span key={m} className="badge-warning" style={{ fontSize: 11 }}>{m}</span>
                          ))}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 5 }}>
                          {Object.values(item.reasons).join(" · ")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
