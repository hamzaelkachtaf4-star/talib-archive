import AuthLayout from "@/components/LawOS/Auth/AuthLayout";
import AuthForm from "@/components/LawOS/Auth/AuthForm";
import { tr } from "@/components/LawOS/lib/i18n";

export default function Register() {
  return (
    <AuthLayout
      title={tr("إنشاء حساب")}
      subtitle={tr(
        "حسابك خاص بك: بطاقاتك وتسجيلاتك ومحاولاتك لا يراها أحد غيرك."
      )}
    >
      <AuthForm mode="register" />
    </AuthLayout>
  );
}
