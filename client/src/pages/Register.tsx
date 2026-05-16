import { useLocation, useNavigate, type Location } from "react-router-dom";
import { AuthForm } from "@/auth/AuthForm";
import { useAuth } from "@/auth/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Set by callers that need a post-auth round-trip (e.g. /join's
  // universal picker, when the recipient picks "Create an account").
  const from = (location.state as { from?: Location } | null)?.from;

  return (
    <AuthForm
      mode="register"
      title="Make an account."
      subtitle="Save a library, watch with friends, keep things in sync across devices."
      submitLabel="Create account"
      switchLink={{ prompt: "Already have one?", cta: "Sign in", to: "/login" }}
      onSubmit={async (input) => {
        await register(input);
        navigate(from?.pathname ?? "/", { replace: true });
      }}
    />
  );
}
