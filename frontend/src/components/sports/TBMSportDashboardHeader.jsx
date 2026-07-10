import { Link } from "react-router-dom";
import TBMPageHeader from "../layout/TBMPageHeader";
import TBMDataCard from "../cards/TBMDataCard";
import TBMHeroPlayCard from "../home/TBMHeroPlayCard";
import TBMPremiumCardStack from "../premium/TBMPremiumCardStack";
import TBMSection from "../layout/TBMSection";
import "./TBMSportDashboardHeader.css";

export default function TBMSportDashboardHeader({
  sport = "Sport",
  title,
  badge = "Premium Dashboard",
  flagshipPlay,
  topPlays = [],
  metrics = [],
  navigation = [],
  premiumTitle,
}) {
  const safeMetrics = Array.isArray(metrics)
    ? metrics.filter((metric) => metric?.label)
    : [];

  const safeNavigation = Array.isArray(navigation)
    ? navigation.filter((item) => item?.label && item?.href)
    : [];

  const safeTopPlays = Array.isArray(topPlays) ? topPlays : [];

  return (
    <div className="tbm-sport-dashboard-header">
      <TBMPageHeader
        eyebrow={`${sport} Model`}
        title={title || `${sport} Dashboard`}
        badge={badge}
      />

      {safeMetrics.length > 0 && (
        <section className="tbm-sport-dashboard-kpis">
          {safeMetrics.map((metric, index) => (
            <TBMDataCard
              key={`${metric.label}-${index}`}
              label={metric.label}
              value={metric.value ?? "N/A"}
              sub={metric.sub || ""}
              tone={metric.tone || "default"}
            />
          ))}
        </section>
      )}

      <TBMHeroPlayCard
        play={flagshipPlay}
        label={`Today's Flagship ${sport} Play`}
      />

      <TBMSection title={premiumTitle || `Today's Premium ${sport} Card`}>
        <TBMPremiumCardStack
          title={`${sport} Model Card`}
          plays={safeTopPlays}
          visibleCount={safeTopPlays.length}
          lockedCount={0}
          showMembershipBadge={false}
        />
      </TBMSection>

      {safeNavigation.length > 0 && (
        <nav
          className="tbm-sport-dashboard-navigation"
          aria-label={`${sport} model navigation`}
        >
          {safeNavigation.map((item) => (
            <Link
              key={`${item.label}-${item.href}`}
              className="tbm-sport-dashboard-navigation-link"
              to={item.href}
            >
              <span>{item.label}</span>
              {item.meta ? <small>{item.meta}</small> : null}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
