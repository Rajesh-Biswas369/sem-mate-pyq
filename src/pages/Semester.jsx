import { Link, useParams } from "react-router-dom";
import { pyqData } from "../data/pyqData";

function Semester() {
  const { semesterName } = useParams();
  const decodedSemester = decodeURIComponent(semesterName);

  const semester = pyqData.find((item) => item.semester === decodedSemester);

  if (!semester) {
    return <div className="app electric-bg">Semester not found.</div>;
  }

  return (
    <div className="app electric-bg page-shell">
      <div className="storm-layer"></div>
      <div className="real-lightning bolt-1"></div>
      <div className="real-lightning bolt-2"></div>
      <div className="real-lightning bolt-3"></div>

      <Link to="/" className="back">
        ← Back
      </Link>

      <header className="topbar electric-title">
        <h1>{semester.semester}</h1>
        <p>Select your subject</p>
      </header>

      <section className="grid subject-grid">
        {semester.subjects.map((subject) => (
          <Link
            to={`/subject/${encodeURIComponent(
              semester.semester
            )}/${encodeURIComponent(subject.name)}`}
            className="electric-card subject-card"
            key={subject.name}
          >
            <h3>{subject.name}</h3>
            <p className="subject-code">{subject.code}</p>
            <p>{subject.papers.length} files available</p>
            <span>View Papers →</span>
          </Link>
        ))}
      </section>
    </div>
  );
}

export default Semester;