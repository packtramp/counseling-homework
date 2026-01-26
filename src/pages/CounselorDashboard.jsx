import { useAuth } from '../hooks/useAuth';

export default function CounselorDashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="dashboard">
      <header>
        <h1>Counselor Dashboard</h1>
        <button onClick={logout}>Sign Out</button>
      </header>
      <main>
        <p>Welcome, {user?.email}</p>
        <p>Counselee list coming soon...</p>
      </main>
    </div>
  );
}
