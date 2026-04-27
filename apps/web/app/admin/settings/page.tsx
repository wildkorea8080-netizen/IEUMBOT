import { PagePanel } from "../../../components/ui/page-panel";

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <PagePanel
        title="챗봇 설정"
        description="페르소나, 톤, 운영시간, 테마, 개인정보 안내문 설정 영역입니다."
      />
    </div>
  );
}
