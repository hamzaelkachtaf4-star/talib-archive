import { Link, useLocation, useNavigate } from "react-router-dom";
import { Back } from "./DirArrow";

/** Goes back to wherever the student came from (a module's methodology tab, say); `fallback` when the page was opened directly. */
export default function BackLink({ fallback = "/law/path", className = "mb-3 flex items-center gap-1 text-sm", children }) {
  const navigate = useNavigate();
  const { key } = useLocation();
  return (
    <Link to={fallback} className={className} onClick={(e) => { if (key !== "default") { e.preventDefault(); navigate(-1); } }}>
      <Back /> {children}
    </Link>
  );
}
