import { PagePanel } from "../../../components/ui/page-panel";

export default function NoAccessPage() {
  return (
    <div className="space-y-4">
      <PagePanel title="접근 가능한 메뉴가 없습니다" description="계정에 부여된 메뉴 권한이 없습니다.">
        <p className="text-sm leading-7 text-slate-600">
          로그인은 완료되었지만, 아직 접근할 수 있는 메뉴가 없습니다.
          <br />
          기관관리자에게 필요한 메뉴 권한을 요청해 주세요. 권한이 부여되면 좌측 메뉴에 표시됩니다.
        </p>
      </PagePanel>
    </div>
  );
}
