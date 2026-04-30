import { SuperAdminPlaceholder } from "../../../components/ui/super-admin-placeholder";

export default function SuperAdminUsagePage() {
  return (
    <SuperAdminPlaceholder
      title="사용량 모니터링"
      description="기관별 사용량, 이상 징후, 기간별 추이를 운영 관점에서 추적하는 화면입니다."
      bullets={[
        "기관별 기간 비교와 급증 탐지 카드",
        "API 및 토큰 사용량 추이 차트",
        "이상 사용 패턴과 조치 이력 테이블",
      ]}
    />
  );
}
