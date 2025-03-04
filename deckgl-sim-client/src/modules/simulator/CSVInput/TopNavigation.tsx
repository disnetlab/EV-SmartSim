import { FC } from "react";

const TopNavigation: FC = () => {
  return (
    <div
      id="top-navigation"
      className={`flex flex-row fixed w-full bg-white p-2 text-sm transition-all items-center gap-2 shadow z-30
        ${appStep === "normal" ? "top-0" : "-top-20"}`}
    >
      <h1 className="font-semibold mr-2">EV-SmartSim</h1>
      <div className="flex flex-row p-1 px-2 rounded bg-slate-700 gap-2 items-center text-xs">
        <span className="text-slate-100">Dataset</span>
        <button
          onClick={() => setShow((v) => ({ ...v, datasetGenerator: true }))}
          className={
            show.datasetGenerator
              ? tailwindStyles.button.selected
              : tailwindStyles.button.basic
          }
        >
          Generate
        </button>
        <button
          onClick={() => setShow((v) => ({ ...v, datasetGenerator: false }))}
          className={
            show.datasetGenerator
              ? tailwindStyles.button.basic
              : tailwindStyles.button.selected
          }
        >
          Import
        </button>
      </div>
    </div>
  );
};

export default TopNavigation;
