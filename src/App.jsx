import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useEffect, useState } from "react";

import Home from "./pages/Home";
import Semester from "./pages/Semester";
import Subject from "./pages/Subject";
import PdfViewer from "./pages/PdfViewer";
import Login from "./pages/Login";

import { auth } from "./firebase";
import "./App.css";

// Created a small component to handle showing/hiding the profile
function FloatingProfile({ user, handleLogout }) {
  const location = useLocation();

  // If the current path is NOT the home page, return nothing (hide it)
  if (location.pathname !== "/") {
    return null;
  }

  // Otherwise, show the floating card
  return (
    <div className="user-floating-card">
      {user.photoURL && (
        <img src={user.photoURL} alt={user.displayName || "User"} />
      )}

      <div>
        <strong>{user.displayName || "Student"}</strong>
        <span>{user.email}</span>
      </div>

      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checkingLogin, setCheckingLogin] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setCheckingLogin(false);
    });

    return () => unsubscribe();
  }, []);

  async function handleLogout() {
    await signOut(auth);
  }

  if (checkingLogin) {
    return (
      <div className="login-page electric-bg">
        <div className="storm-layer"></div>
        <div className="real-lightning bolt-1"></div>
        <div className="real-lightning bolt-2"></div>
        <div className="real-lightning bolt-3"></div>

        <div className="login-card">
          <div className="login-logo">⚡</div>
          <h1>Loading...</h1>
          <p>Checking your login status</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      {/* Replaced the hardcoded div with the new component */}
      <FloatingProfile user={user} handleLogout={handleLogout} />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/semester/:semesterName" element={<Semester />} />
        <Route
          path="/subject/:semesterName/:subjectName"
          element={<Subject />}
        />
        <Route
          path="/viewer/:semesterName/:subjectName/:paperIndex"
          element={<PdfViewer />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;