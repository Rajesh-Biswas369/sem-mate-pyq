import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { pyqData } from "../data/pyqData";
import LatestUpdates from "../components/Latestupdates.jsx";
import Footer from "../components/Footer";
import { auth } from "../firebase";

function Home() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  // Listen for Firebase login state changes in real-time
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe(); // Cleanup listener on unmount
  }, []);

  return (
    <div className="app electric-bg page-shell">
      {/* Background Storm Layers */}
      <div className="storm-layer"></div>
      <div className="real-lightning bolt-1"></div>
      <div className="real-lightning bolt-2"></div>
      <div className="real-lightning bolt-3"></div>

      {/* Floating Smart Auth Card */}
      <div className="user-floating-card">
        {user ? (
          <>
            <img 
              src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=facc15&color=111827`} 
              alt="Profile" 
            />
            <div>
              <strong>{user.displayName?.split(" ")[0] || "Student"}</strong>
              <span>JU EE Section B</span>
            </div>
            <button 
              onClick={() => auth.signOut()} 
              style={{ padding: '6px 12px', fontSize: '12px', marginLeft: 'auto' }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <div style={{ padding: '0 8px' }}>
              <strong>Guest Mode</strong>
              <span>Sign in for full access</span>
            </div>
            <button 
              onClick={() => navigate('/login')} 
              style={{ marginLeft: 'auto' }}
            >
              Login ⚡
            </button>
          </>
        )}
      </div>

      {/* Main Animated Header */}
      <header className="topbar">
        <h1>JU EE PYQ Solutions</h1>
        <p>Master your engineering concepts with just-in-time solutions and comprehensive notes.</p>
      </header>

      {/* Enhanced Hero Panel */}
      <section className="hero glass-panel">
        <h2>Select Your Path</h2>
        <p>Navigate through your semester to uncover subject-wise PDFs, compact tabular progress trackers, and exclusive exam solutions.</p>
      </section>

      {/* Live Activity Feed */}
      <LatestUpdates />

      {/* Premium Semester Grid Selection */}
      <section className="grid semester-grid">
        {pyqData.map((sem, index) => {
          // Highlight the 4th semester visually as the active/current block
          const isCurrentSem = sem.semester === "Semester 4";

          return (
            <Link
              to={`/semester/${encodeURIComponent(sem.semester)}`}
              className="electric-card semester-card"
              key={sem.semester}
              style={isCurrentSem ? { borderColor: 'rgba(250, 204, 21, 0.5)', boxShadow: '0 0 20px rgba(250, 204, 21, 0.1)' } : {}}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3>{sem.semester}</h3>
                  {isCurrentSem && (
                    <span style={{ fontSize: '11px', background: '#facc15', color: '#111827', padding: '4px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                      CURRENT
                    </span>
                  )}
                </div>
                <p className="subject-code" style={{ marginTop: '6px' }}>
                  Phase {index + 1} of Electrical Engineering
                </p>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px', fontWeight: 'bold' }}>
                  📚 {sem.subjects.length} Subjects
                </p>
                <span style={isCurrentSem ? { color: '#facc15' } : {}}>Explore →</span>
              </div>
            </Link>
          );
        })}
      </section>

      <Footer />
    </div>
  );
}

export default Home;