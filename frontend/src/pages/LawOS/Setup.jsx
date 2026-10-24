import AuthLayout from "@/components/LawOS/Auth/AuthLayout";
import AuthForm from "@/components/LawOS/Auth/AuthForm";
import { tr } from "@/components/LawOS/lib/i18n";

export default function Setup() {
  return (
    <AuthLayout
      title={tr("إعداد المنصة")}
      subtitle={tr(
        "أنشئ حساب المسؤول. بياناتك الحالية تبقى في هذا الحساب، وبعدها يمكن للطلبة إنشاء حساباتهم الخاصة."
      )}
    >
      <AuthForm mode="setup" />
    </AuthLayout>
  );
}
