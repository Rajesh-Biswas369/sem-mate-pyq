import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { GoogleAuthProvider, signInWithCredential, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";
import { useNavigate, Link } from "react-router-dom";

function Login() {
  const navigate = useNavigate();

  function isCapacitorNative() {
    return Capacitor.isNativePlatform();
  }

  async function signInWithNativeGoogle() {
    const result = await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true,
    });

    const idToken = result?.credential?.idToken;
    const accessToken = result?.credential?.accessToken;
    if (!idToken) {
      throw new Error("Google did not return an ID token. Check google-services.json, SHA-1, and Firebase Google provider setup.");
    }

    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    return signInWithCredential(auth, credential);
  }

  async function handleGoogleLogin() {
    try {
      if (isCapacitorNative()) {
        await signInWithNativeGoogle();
        navigate("/");
        return;
      }

      googleProvider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, googleProvider);
      // Automatically redirect the user to the Home page after successful login!
      navigate("/"); 
    } catch (error) {
      console.error("Google login error:", error);
      const friendlyMessage =
        error?.code === "auth/popup-closed-by-user"
          ? "Google login was closed before it finished."
          : isCapacitorNative()
          ? "Google login failed inside the Android app. Check google-services.json, SHA-1, package name com.semmate.app, and rebuild the APK after Capacitor sync."
          : "Google login failed. Please try again.";
      alert(`${friendlyMessage}\n\n${error?.message || ""}`.trim());
    }
  }

  return (
    <div className="login-page electric-bg">
      {/* Background Animations */}
      <div className="storm-layer"></div>
      <div className="real-lightning bolt-1"></div>
      <div className="real-lightning bolt-2"></div>
      <div className="real-lightning bolt-3"></div>

      {/* Floating Glass Login Card */}
      <main className="login-card">
        <div className="login-badge">SEM-MATE</div>

        <div className="login-logo" aria-hidden="true"></div>

        <div className="login-heading">
          <h1>Sem-Mate</h1>
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
          {/* A clean, standard Google "G" icon */}
          <svg className="google-icon" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span>Continue with Gmail</span>
        </button>

        <p className="login-note">
          Built for JU Electrical Engineering students.
        </p>

        {/* Let users go back if they change their mind */}
        <Link to="/" style={{ display: 'block', marginTop: '20px', color: '#cbd5e1', fontSize: '14px', fontWeight: 'bold' }}>
          ← Back to Home
        </Link>
      </main>
    </div>
  );
}

export default Login;
