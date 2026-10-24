import { Navigate } from "react-router-dom";

/** The faculty forum opens on the wall (campus); the reading groups are their own hub. */
export default function Community() {
  return <Navigate to="/law/community/campus" replace />;
}
