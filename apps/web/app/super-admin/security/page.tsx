import { SuperAdminPlaceholder } from "../../../components/ui/super-admin-placeholder";

export default function SuperAdminSecurityPage() {
  return (
    <SuperAdminPlaceholder
      title="시스템/보안"
      description="플랫폼 공통 보안 정책과 운영 위험 신호를 점검하는 화면입니다."
      bullets={[
        "관리자 인증/권한 정책 점검",
        "감사 로그 및 이상 접근 탐지 현황 확인",
        "보안 점검 체크리스트 및 대응 이력 조회",
      ]}
    />
  );
}

