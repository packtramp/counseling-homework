import { useAuth } from '../hooks/useAuth';

export default function CounseleeDashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="dashboard">
      <header>
        <h1>My Homework</h1>
        <button onClick={logout}>Sign Out</button>
      </header>
      <main>
        <p>Welcome, {user?.email}</p>
        <p>Your homework checklist coming soon...</p>
      </main>
    </div>
  );
}
