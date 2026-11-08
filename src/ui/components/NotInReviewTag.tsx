const NOT_IN_REVIEW_TIP = "Dated before you last looked, but after the commit your latest review was on, so it's new to you";

/**
 * On a commit new since you last looked though dated before then
 * (isNotInReview): why it's new. In the detail pane's Activity tab, where
 * it's also below the divider in "All", and in the row's summary.
 */
export function NotInReviewTag() {
  return (
    <span className="pr-activity-tag" data-tip={NOT_IN_REVIEW_TIP} data-tip-on="hover">
      Not in your last review<span className="ui-visually-hidden">: {NOT_IN_REVIEW_TIP}</span>
    </span>
  );
}
