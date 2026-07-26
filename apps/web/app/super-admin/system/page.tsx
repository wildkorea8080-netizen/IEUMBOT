import { SuperAdminPasswordPolicy } from "../../../components/super-admin-password-policy";
import { SuperAdminSystemManagement } from "../../../components/super-admin-system-management";

export default function SuperAdminSystemPage() {
  return (
    <div className="space-y-6">
      <SuperAdminSystemManagement />
      <SuperAdminPasswordPolicy />
    </div>
  );
}
