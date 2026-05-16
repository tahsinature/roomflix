import { Navigate } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import { useAuth } from "@/auth/AuthContext";

// `/` is a thin branch. AuthedLayout has already ensured we have either
// a user or a guest by the time we render — so we only handle the two
// authenticated cases here:
//   • guest          → /library (the most useful first stop)
//   • logged-in user → Dashboard
export default function Home() {
  const { guest } = useAuth();
  if (guest) return <Navigate to="/library" replace />;
  return <Dashboard />;
}
