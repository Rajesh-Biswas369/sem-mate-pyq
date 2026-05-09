import Footer from "../components/Footer";
import { Link, useParams } from "react-router-dom";
import { pyqData } from "../data/pyqData";

function countFiles(folderOrSubject) {
  const directFiles = folderOrSubject?.files?.length || 0;
  const nestedFiles =
    folderOrSubject?.subFolders?.reduce(
      (total, subFolder) => total + countFiles(subFolder),
      0
    ) || 0;
  const subjectFiles =
    folderOrSubject?.folders?.reduce(
      (total, folder) => total + countFiles(folder),
      0
    ) || 0;

  return directFiles + nestedFiles + subjectFiles;
}

function Semester() {
  const { semesterName } = useParams();
  const decodedSemester = decodeURIComponent(semesterName || "");

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
            to={`/subject/${encodeURIComponent(semester.semester)}/${encodeURIComponent(subject.name)}`}
            className="electric-card subject-card"
            key={subject.name}
          >
            <h3>{subject.name}</h3>
            <p className="subject-code">{subject.code}</p>
            <p>
              {subject.folders?.length || 0} folders • {countFiles(subject)} files available
            </p>
            <span>Open Subject →</span>
          </Link>
        ))}
      </section>

      <Footer />
    </div>
  );
}

export default Semester;
