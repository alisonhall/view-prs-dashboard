(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsSectionRenderHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrSectionRenderHelpers = ({ buildPrSection } = {}) => {
    const buildPrSectionSafe =
      typeof buildPrSection === "function" ? buildPrSection : () => null;

    const appendPrSections = (sectionsHost, sectionConfigs = []) => {
      const safeConfigs = Array.isArray(sectionConfigs) ? sectionConfigs : [];
      safeConfigs.forEach((sectionConfig) => {
        sectionsHost.appendChild(buildPrSectionSafe(sectionConfig));
      });
    };

    return {
      appendPrSections,
    };
  };

  return {
    createPrSectionRenderHelpers,
  };
});
