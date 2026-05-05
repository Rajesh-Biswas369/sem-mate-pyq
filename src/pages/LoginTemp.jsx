import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

function Login() {
  async function handleGoogleLogin() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Google login error:", error);
      alert(error.message);
    }
  }

  return (
    <div className="login-page electric-bg">
      <div className="storm-layer"></div>
      <div className="real-lightning bolt-1"></div>
      <div className="real-lightning bolt-2"></div>
      <div className="real-lightning bolt-3"></div>

      <main className="login-card">
        <div className="login-badge">JU EE PYQ SOLUTIONS</div>

        <div className="login-logo">
          <span>⚡</span>
        </div>

        <div className="login-heading">
          <h1>SEM-MATE</h1>
          <h2>Smart PYQ Solution Library</h2>
        </div>

        <p className="login-description">
          Access semester-wise question papers, detailed solutions, and
          view-only PDF notes with secure Gmail login.
        </p>

        <div className="login-feature-grid">
          <div>
            <strong>⚡ Fast</strong>
            <span>Quick access</span>
          </div>

          <div>
            <strong>🔒 Secure</strong>
            <span>Gmail login</span>
          </div>

          <div>
            <strong>📄 View-only</strong>
            <span>PDF viewer</span>
          </div>
        </div>

        <button className="google-login-btn" onClick={handleGoogleLogin}>
          <span className="google-icon">G</span>
          <span>Continue with Gmail</span>
        </button>

        <p className="login-note">
          Built for JU Electrical Engineering students.
        </p>
      </main>
    </div>
  );
}

export default Login;