import { BrowserRouter, Routes, Route } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";

import Home from "./pages/Home";
import Semester from "./pages/Semester";
import Subject from "./pages/Subject";
import PdfViewer from "./pages/PdfViewer";
import Login from "./pages/Login";

import { auth } from "./firebase";
import "./App.css";

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
    <BrowserRouter>
      <Routes>
        {/* The logout card is explicitly tied ONLY to the Home Route */}
        <Route
          path="/"
          element={
            <>
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
              <Home />
            </>
          }
        />
        
        {/* The rest of your routes */}
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

      {/* Analytics goes here! Inside BrowserRouter, but outside Routes */}
      <Analytics /> 

    </BrowserRouter>
  );
}

export default App;
