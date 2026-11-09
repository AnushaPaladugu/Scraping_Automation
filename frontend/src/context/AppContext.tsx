import React, { createContext, useContext, useState } from "react";
import { JobScope } from "../types";

export interface AppContextType {
  activeTaskId: string | null;
  setActiveTaskId: (id: string | null) => void;
  jobScope: JobScope | null;
  setJobScope: (scope: JobScope | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [jobScope, setJobScope] = useState<JobScope | null>(null);

  return (
    <AppContext.Provider
      value={{
        activeTaskId,
        setActiveTaskId,
        jobScope,
        setJobScope,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
