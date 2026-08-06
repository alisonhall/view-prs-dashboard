const createViewPrsDataReadHelpers = ({ readViewPrsData, enqueuePrDiffRefreshForData }) => {
  const readDataWithDiffRefreshEnqueued = () => {
    const data = readViewPrsData();
    enqueuePrDiffRefreshForData(data);
    return data;
  };

  return {
    readDataWithDiffRefreshEnqueued,
  };
};

module.exports = {
  createViewPrsDataReadHelpers,
};