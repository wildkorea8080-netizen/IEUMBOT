import Link from "next/link";

import { PagePanel } from "../../../components/ui/page-panel";

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <PagePanel title="계정 설정" description="관리자 계정 보안 설정을 관리합니다.">
        <Link
          href="/admin/change-password"
          className="inline-flex rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          비밀번호 변경
        </Link>
      </PagePanel>
    </div>
  );
}
