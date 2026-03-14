import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg rounded-xl bg-white px-6 py-8 shadow-lg sm:px-10">
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-gray-900">
          Dashboard
        </h1>
        <p className="text-gray-600">
          Welcome,{" "}
          <span className="font-medium text-gray-900">{user?.email}</span>
        </p>
        <p className="mt-1 text-sm text-gray-400">
          The URL scanner will be built here.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-800 focus:ring-offset-2"
        >
          Sign Out
        </button>
      </div>
    </main>
  );
}
