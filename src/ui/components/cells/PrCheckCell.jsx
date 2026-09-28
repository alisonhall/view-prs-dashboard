/**
 * PrCheckCell - The "CHK" column, parsed from the titleDisplay markers.
 * Matches vanilla's check-cell (createTextCell(formatChkDisplay(...))).
 *
 * @module components/cells/PrCheckCell
 */

import { createPrStatusDisplayHelpers } from '../../helpers/pr-status-display.helpers.js';

const { formatChkDisplay } = createPrStatusDisplayHelpers();

export function PrCheckCell({ pr }) {
  return <td className="check-cell">{formatChkDisplay(pr?.titleDisplay)}</td>;
}
