import React from 'react';
import Papa from 'papaparse';

const CsvLoader = ({ onLoadData, dataType }) => {
  const handleFileLoad = (event) => {
    const file = event.target.files[0];
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        onLoadData(results.data, dataType);
      }
    });
  };

  return (
    <div>
      <input type="file" accept=".csv" onChange={handleFileLoad} />
    </div>
  );
};

export default CsvLoader;
