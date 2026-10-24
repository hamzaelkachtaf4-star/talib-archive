import { createContext, useContext } from "react";

// The signed-in account ({ id, role, email, fullName, … }), provided by LawRoute.
export const LawUserContext = createContext(null);

export function useLawUser() {
  return useContext(LawUserContext);
}

export function useIsAdmin() {
  return useContext(LawUserContext)?.role === "admin";
}
