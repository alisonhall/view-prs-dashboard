/**
 * PrCheckCell - The "CHK" column, parsed from the titleDisplay markers.
 * Matches vanilla's check-cell (createTextCell(formatChkDisplay(...))).
 *
 * @module components/cells/PrCheckCell
 */


export function PrCheckCell({ pr }) {
  const formatChkDisplay = window.formatChkDisplay || ((value) => String(value || '-'));
  return <td className="check-cell">{formatChkDisplay(pr?.titleDisplay)}</td>;
}
