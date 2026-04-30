import { SuperAdminPlaceholder } from "../../../components/ui/super-admin-placeholder";

export default function SuperAdminSecurityPage() {
  return (
    <SuperAdminPlaceholder
      title="보안 로그"
      description="접속, 권한 변경, 이상 행위를 장기 보관 로그 기준으로 점검하는 운영 보안 화면입니다."
      bullets={[
        "권한 변경과 대리접속 추적 카드",
        "위험도별 이벤트 목록과 필터",
        "내보내기와 감사 대응용 상세 로그 패널",
      ]}
    />
  );
}
