import AuthLayout from "@/components/LawOS/Auth/AuthLayout";
import AuthForm from "@/components/LawOS/Auth/AuthForm";
import { tr, lang } from "@/components/LawOS/lib/i18n";
import { brandName } from "@/config/brand";

export default function Login() {
  return (
    <AuthLayout
      title={tr("تسجيل الدخول")}
      subtitle={tr("مرحباً بعودتك إلى {0}.", [brandName(lang())])}
    >
      <AuthForm mode="login" />
    </AuthLayout>
  );
}
