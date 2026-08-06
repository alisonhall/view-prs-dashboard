const createViewPrsDataDeltaHelpers = ({ isObject }) => {
  const parseRequestedPrNumbers = (body) => {
    if (!isObject(body) || !Array.isArray(body.prNumbers)) {
      return null;
    }

    const requestedPrNumbers = body.prNumbers
      .map((value) => String(value || "").trim())
      .filter((value) => /^\d+$/.test(value));

    return Array.from(new Set(requestedPrNumbers));
  };

  const buildDataDeltaPayload = ({ data, requestedPrNumbers }) => {
    const byPrNumber = isObject(data?.byPrNumber) ? data.byPrNumber : {};
    const deltaByPrNumber = {};

    requestedPrNumbers.forEach((prNumber) => {
      if (Object.prototype.hasOwnProperty.call(byPrNumber, prNumber)) {
        deltaByPrNumber[prNumber] = byPrNumber[prNumber];
      }
    });

    const missingPrNumbers = requestedPrNumbers.filter(
      (prNumber) => !Object.prototype.hasOwnProperty.call(deltaByPrNumber, prNumber),
    );

    return {
      byPrNumber: deltaByPrNumber,
      missingPrNumbers,
      requestedCount: requestedPrNumbers.length,
    };
  };

  return {
    parseRequestedPrNumbers,
    buildDataDeltaPayload,
  };
};

module.exports = {
  createViewPrsDataDeltaHelpers,
};