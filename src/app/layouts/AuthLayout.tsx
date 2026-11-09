import { Outlet } from 'react-router';

/** Centered single-column layout for sign-in, onboarding and waiting screens. */
export function AuthLayout() {
  return (
    <main className="app-main auth-main">
      <div className="auth-logo" aria-hidden="true">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={56} height={56} />
        <span>Mini-Messi&apos;s</span>
      </div>
      <Outlet />
    </main>
  );
}
