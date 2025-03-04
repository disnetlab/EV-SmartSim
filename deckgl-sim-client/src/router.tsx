import { createHashRouter } from "react-router-dom";
import SimulatorCSVInput from "./modules/simulator/CSVInput/CSVInput";

const router = createHashRouter([
  {
    path: "/",
    children: [
      {
        index: true,
        element: <SimulatorCSVInput />,
      },
      {
        path: "csv",
        element: <SimulatorCSVInput />,
      },
    ],
  },
]);

export default router;
