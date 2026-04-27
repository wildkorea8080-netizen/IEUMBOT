"use client";

import { useState } from "react";

import { PagePanel } from "../../../components/ui/page-panel";
import { ApiClientError } from "../../../lib/api";
import { getGuardrails, patchGuardrail, type GuardrailRule } from "../../../lib/api/guardrails";

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `${error.code}: ${error.message}`;
  }
  return "요청 처리 중 오류가 발생했습니다.";
}

export default function GuardrailsPage() {
  const [chatbotId, setChatbotId] = useState("");
  const [rules, setRules] = useState<GuardrailRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!chatbotId.trim()) {
      setError("chatbotId를 입력하세요.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await getGuardrails(chatbotId.trim());
      setRules(response.rules);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRule = async (rule: GuardrailRule) => {
    try {
      await patchGuardrail(chatbotId.trim(), rule.id, { isActive: !rule.isActive });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <PagePanel title="가드레일 설정" description="금지 표현/민감 질문 차단 규칙 상태를 운영합니다.">
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={chatbotId}
            onChange={(e) => setChatbotId(e.target.value)}
            placeholder="chatbotId"
            className="w-full max-w-xl rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            조회
          </button>
        </div>
        {isLoading ? <p className="text-sm text-slate-600">불러오는 중...</p> : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {!isLoading && rules.length === 0 ? (
          <p className="text-sm text-slate-500">규칙이 없습니다.</p>
        ) : null}
        {rules.length > 0 ? (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="rounded border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">
                  {rule.ruleType} / {rule.targetCategory}
                </p>
                <p className="mt-1 text-slate-600">매치값: {rule.matchValue}</p>
                <p className="mt-1 text-slate-600">액션: {rule.actionType}</p>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => void toggleRule(rule)}
                    className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                  >
                    {rule.isActive ? "비활성화" : "활성화"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </PagePanel>
    </div>
  );
}

