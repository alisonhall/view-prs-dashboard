/**
 * ApprovalRiskSection - "Approval risk details" insight section: for each
 * approval, whether later activity suggests the approval was risky. Matches
 * vanilla's createApprovalRiskSection (index.page.js).
 *
 * @module components/insights/ApprovalRiskSection
 */

import { InsightSection } from './InsightSection';
import { useActorIdentity } from '../../state/ActorIdentityContext';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { createPrFormattingHelpers } from '../../helpers/pr-formatting.helpers.js';

const { formatIsoDatetime, toCount } = createPrFormattingHelpers();

export function ApprovalRiskSection({ metrics, actorsMap }) {
  const { resolveActorDisplayName } = useActorIdentity();
  const { formatDurationMinutes } = usePrInsightsDisplay();
  const asArray = window.asArray || ((value) => (Array.isArray(value) ? value : []));

  const approvals = asArray(metrics?.approvals);
  if (!approvals.length) return null;

  return (
    <InsightSection summaryText="Approval risk details">
      <div className="insight-list">
        {approvals.map((approval, index) => {
          const riskText = approval.riskyApproval ? 'risk flagged' : 'no later issue signal';
          const displayName = resolveActorDisplayName(approval.login, actorsMap, approval.name);
          return (
            <div key={index} className="insight-list-item">
              <div>
                <strong>{displayName}</strong>
                <span>
                  {' '}
                  approved {formatIsoDatetime(approval.approvedAt || '-')} | {riskText}
                </span>
              </div>
              <div className="insight-subtle">
                Comments after: {toCount(approval.commentCountAfterApproval)}, reviews after:{' '}
                {toCount(approval.reviewCountAfterApproval)}, change requests after:{' '}
                {toCount(approval.changeRequestCountAfterApproval)}, commits after:{' '}
                {toCount(approval.commitCountAfterApproval)}, merge lead:{' '}
                {approval.mergeLeadMinutes == null ? '-' : formatDurationMinutes(approval.mergeLeadMinutes)}
              </div>
            </div>
          );
        })}
      </div>
    </InsightSection>
  );
}
