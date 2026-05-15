import { useNavigate } from "react-router-dom";
import { AuthForm } from "@/auth/AuthForm";
import { useAuth } from "@/auth/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  return (
    <AuthForm
      mode="register"
      title="Make an account."
      subtitle="Save a library, watch with friends, keep things in sync across devices."
      submitLabel="Create account"
      switchLink={{ prompt: "Already have one?", cta: "Sign in", to: "/login" }}
      onSubmit={async (input) => {
        await register(input);
        navigate("/", { replace: true });
      }}
    />
  );
}
