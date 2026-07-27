export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard content">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-subtitle" />
      <div className="skeleton-metrics">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="skeleton skeleton-card" key={index} />
        ))}
      </div>
      <div className="skeleton skeleton-table" />
    </div>
  );
}
