import React from "react";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { AppProvider } from "./context/AppContext";

export const App: React.FC = () => {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
};

export default App;
