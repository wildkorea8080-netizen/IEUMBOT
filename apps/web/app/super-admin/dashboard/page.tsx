import { SuperAdminPlaceholder } from "../../../components/ui/super-admin-placeholder";

export default function SuperAdminDashboardPage() {
  return (
    <SuperAdminPlaceholder
      title="대시보드"
      description="전체 기관과 플랫폼 운영 상태를 한 화면에서 확인하는 영역입니다."
      bullets={[
        "기관 수, 챗봇 수, 위젯 배포 수 요약 지표",
        "최근 장애/보안 이벤트 요약",
        "계약 만료 예정 기관 알림",
      ]}
    />
  );
}

