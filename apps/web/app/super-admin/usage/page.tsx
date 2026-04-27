import { SuperAdminPlaceholder } from "../../../components/ui/super-admin-placeholder";

export default function SuperAdminUsagePage() {
  return (
    <SuperAdminPlaceholder
      title="사용량/통계"
      description="기관별 사용량과 품질 지표를 확인하는 운영 통계 화면입니다."
      bullets={[
        "기관별 대화량/활성 세션/응답 실패율 집계",
        "정책 차단, 에스컬레이션, 근거 부족 비율 추적",
        "계약 한도 대비 사용량 모니터링",
      ]}
    />
  );
}

