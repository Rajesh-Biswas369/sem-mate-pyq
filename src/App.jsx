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

        {/* Direct public-style paths used by Subject.jsx, e.g. /viewer/Sem4/SSM/PYQ/ssm-2022.pdf */}
        <Route path="/viewer/*" element={<PdfViewer />} />

        {/* Old route kept for previous links. */}
        <Route path="/viewer/:semesterName/:subjectName/:paperIndex" element={<PdfViewer />} />
      </Routes>
    </Router>
  );
}

export default App;
