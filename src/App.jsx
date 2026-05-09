import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import "./App.css";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Semester from "./pages/Semester";
import Subject from "./pages/Subject";
import PdfViewer from "./pages/PdfViewer";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/semester/:semesterName" element={<Semester />} />
        <Route path="/subject/:semesterName/:subjectName" element={<Subject />} />

        {/* Old links, if any, still work */}
        <Route path="/viewer/:semesterName/:subjectName/:paperIndex" element={<PdfViewer />} />

        {/* New direct public-PDF links from Subject.jsx work here */}
        <Route path="/viewer/*" element={<PdfViewer />} />
      </Routes>
    </Router>
  );
}

export default App;
