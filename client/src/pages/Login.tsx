import { useNavigate, useLocation, type Location } from "react-router-dom";
import { AuthForm } from "@/auth/AuthForm";
import { useAuth } from "@/auth/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Preserved by RequireAuth when it bounced an unauth'd visitor here. Lets
  // a room deep-link survive a login round-trip.
  const from = (location.state as { from?: Location } | null)?.from;

  return (
    <AuthForm
      mode="login"
      title="Welcome back."
      subtitle="Sign in to open your library and start a room."
      submitLabel="Sign in"
      switchLink={{ prompt: "New here?", cta: "Create an account", to: "/register" }}
      onSubmit={async (input) => {
        await login(input);
        navigate(from?.pathname ?? "/", { replace: true });
      }}
    />
  );
}
