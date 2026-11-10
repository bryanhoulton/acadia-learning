import { RouterProvider } from "react-router-dom";
import { SlateProvider } from "slate-ui";
import { Toaster } from "sonner";

import { router } from "./router";

function App() {
  return (
    <SlateProvider>
      <Toaster />
      <RouterProvider router={router} />
    </SlateProvider>
  );
}

export default App;
