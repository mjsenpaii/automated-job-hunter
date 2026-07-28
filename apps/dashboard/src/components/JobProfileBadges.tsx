export function JobProfileBadges({
  matchedProfileIds,
  matchedProfileLabels,
  className,
}: {
  matchedProfileIds: readonly string[];
  matchedProfileLabels: readonly string[];
  className?: string;
}) {
  const labels =
    matchedProfileIds.length > 0 && matchedProfileLabels.length > 0
      ? matchedProfileLabels
      : ['Untargeted'];
  return (
    <span className={className} data-profile-count={matchedProfileIds.length}>
      {labels.join(' • ')}
    </span>
  );
}
