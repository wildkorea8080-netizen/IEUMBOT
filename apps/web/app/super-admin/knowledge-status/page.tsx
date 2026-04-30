import { SuperAdminPlaceholder } from "../../../components/ui/super-admin-placeholder";

export default function SuperAdminKnowledgeStatusPage() {
  return (
    <SuperAdminPlaceholder
      title="지식 현황"
      description="기관별 지식 적재, 인덱싱 실패, 최신화 상태를 슈퍼관리자 시야에서 확인하는 화면입니다."
      bullets={[
        "기관별 지식 적재량과 실패 건수 요약",
        "처리 상태별 큐 및 재시도 현황",
        "오래된 지식과 갱신 필요 항목 목록",
      ]}
    />
  );
}
