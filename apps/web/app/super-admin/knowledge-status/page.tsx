import { SuperAdminPlaceholder } from "../../../components/ui/super-admin-placeholder";

export default function SuperAdminKnowledgeStatusPage() {
  return (
    <SuperAdminPlaceholder
      title="지식베이스 현황"
      description="기관별 문서/웹 소스 색인 상태를 운영 관점에서 점검하는 화면입니다."
      bullets={[
        "기관별 문서 처리 상태 및 최근 색인 결과 확인",
        "웹 소스 동기화 상태 및 오류 현황 확인",
        "지식베이스 최신성/유효기간 점검 진입점 제공",
      ]}
    />
  );
}

